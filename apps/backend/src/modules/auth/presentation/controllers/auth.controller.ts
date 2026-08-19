import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual, createHash } from 'crypto';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  ResolveIdentityDtoSchema,
  type ResolveIdentityDto,
  type ResolveIdentityOutputDto,
} from '../../application/dtos/resolve-identity.dto';
import { ReviewerLoginDtoSchema, type ReviewerLoginDto } from '@delta/shared-types';
import { ResolveIdentityUseCase } from '../../application/use-cases/resolve-identity.use-case';
import { ProcessLoginTouchUseCase } from '../../application/use-cases/process-login-touch.use-case';
import type { ProcessLoginTouchOutput } from '../../application/use-cases/process-login-touch.use-case';
import { INTERNAL_AUTH_SECRET_HEADER } from '../../infrastructure/guards/internal-secret.guard';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ReviewerTokenService } from '../../../../infrastructure/auth/reviewer-token.service';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Compares two arbitrary strings in constant time by hashing both to a
 * fixed-length SHA-256 digest before calling timingSafeEqual.
 *
 * This avoids the undefined behavior of timingSafeEqual when the two Buffers
 * have different lengths (it throws), and prevents length-dependent timing leaks
 * on the raw strings while keeping the code self-contained (no bcrypt dependency
 * for this Etapa 1 implementation).
 *
 * NOTE: This is NOT a password hashing scheme — both inputs are treated as
 * plaintext strings. Upgrade to bcrypt (REVIEWER_PASSWORD_HASH) in Etapa 2.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * AuthController
 *
 * Exposes:
 *   POST /api/auth/resolve-identity — machine-to-machine endpoint called by the
 *     Next.js BFF after a successful Auth0 login. Authenticates via
 *     x-internal-auth-secret. Also fires a best-effort login touch.
 *
 *   POST /api/auth/login-touch — fires a login touch for the authenticated user.
 *     Authenticated via AppAuthGuard (dev or auth0 mode depending on AUTH_MODE).
 *     The profileId is always taken from user.sub (anti-IDOR — never from body).
 *
 *   POST /api/auth/reviewer-login — flag-gated endpoint for Google OAuth reviewers.
 *     Returns 404 when REVIEWER_ACCESS_ENABLED !== 'true' (endpoint is effectively
 *     invisible). On valid credentials, issues a short-lived HMAC session token.
 *     See ReviewerTokenService for the token format and security properties.
 *
 *     Environment variables (set in Cloud Run secrets / .env):
 *       REVIEWER_ACCESS_ENABLED  — kill-switch; must be 'true' to enable.
 *       REVIEWER_EMAIL           — reviewer's login email.
 *       REVIEWER_PASSWORD        — reviewer's password (plaintext; compared timing-safe).
 *       REVIEWER_PROFILE_ID      — UUID of the demo doctor profile in the DB.
 *       REVIEWER_SESSION_SECRET  — HMAC secret for session tokens (consumed by
 *                                  ReviewerTokenService).
 *
 *     Deferred (Etapa 2): bcrypt password hashing and request-level rate limiting.
 *     Current implementation uses timingSafeEqual on plaintext; acceptable for a
 *     short-lived reviewer window but should be hardened before extended use.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly resolveIdentityUseCase: ResolveIdentityUseCase,
    private readonly processLoginTouchUseCase: ProcessLoginTouchUseCase,
    private readonly reviewerTokenService: ReviewerTokenService,
    private readonly config: ConfigService,
  ) {}

  @Post('resolve-identity')
  @HttpCode(HttpStatus.OK)
  async resolveIdentity(
    @Headers(INTERNAL_AUTH_SECRET_HEADER) callerSecret: string | undefined,
    @Body(new ZodValidationPipe(ResolveIdentityDtoSchema)) dto: ResolveIdentityDto,
  ): Promise<SuccessResponse<ResolveIdentityOutputDto>> {
    const data = await this.resolveIdentityUseCase.execute(dto, callerSecret);

    // Best-effort login touch — must never break the login response.
    try {
      await this.processLoginTouchUseCase.execute({
        profileId: data.id,
        role: data.role,
      });
    } catch (err) {
      this.logger.warn('Login touch failed (best-effort — ignored)', err);
    }

    return { success: true, data };
  }

  /**
   * POST /api/auth/login-touch
   *
   * Fires a login touch for the authenticated user. Used by the BFF after
   * successful login in both dev and auth0 modes. The profileId is ALWAYS
   * taken from the guard-provided user.sub — body is intentionally ignored
   * for anti-IDOR.
   */
  @Post('login-touch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AppAuthGuard)
  async loginTouch(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ProcessLoginTouchOutput>> {
    const data = await this.processLoginTouchUseCase.execute({
      profileId: user.sub,
      role: user.role,
    });
    return { success: true, data };
  }

  /**
   * POST /api/auth/reviewer-login
   *
   * Flag-gated reviewer authentication endpoint.
   *
   * Returns 404 when REVIEWER_ACCESS_ENABLED !== 'true', making the endpoint
   * effectively invisible to scanners when the flag is off.
   *
   * On valid credentials, returns a short-lived HMAC session token (15 min)
   * that the reviewer client sends as the x-reviewer-token header on subsequent
   * requests. AppAuthGuard intercepts that header and sets request.user to the
   * demo doctor profile — scoped exclusively to REVIEWER_PROFILE_ID.
   *
   * Security notes:
   *   - Email and password comparisons are both timing-safe.
   *   - A single generic 401 is returned for any credential mismatch (no
   *     distinction between wrong email vs. wrong password).
   *   - Neither credentials nor the issued token are logged.
   *   - The endpoint is intentionally unauthenticated (no @UseGuards) because it
   *     IS the authentication step.
   *
   * TODO (Etapa 2): Replace plaintext REVIEWER_PASSWORD with bcrypt hash
   *   (REVIEWER_PASSWORD_HASH) and add server-side rate limiting (Redis or WAF).
   */
  @Post('reviewer-login')
  @HttpCode(HttpStatus.OK)
  async reviewerLogin(
    @Body(new ZodValidationPipe(ReviewerLoginDtoSchema)) dto: ReviewerLoginDto,
  ): Promise<SuccessResponse<{ token: string; expiresInSeconds: number }>> {
    // Kill-switch: if the flag is off, behave as if the endpoint does not exist.
    const enabled = this.config.get<string>('REVIEWER_ACCESS_ENABLED');
    if (enabled !== 'true') {
      throw new NotFoundException();
    }

    // Mis-configuration guard: all three secrets must be present and non-empty.
    // Without this check, a missing env var would coerce to '' via ?? '', allowing
    // any credential to match an empty configured value and emit a token with an
    // empty sub — which would resolve to an unknown profile in AppAuthGuard.
    const configuredEmail = this.config.get<string>('REVIEWER_EMAIL');
    const configuredPassword = this.config.get<string>('REVIEWER_PASSWORD');
    const profileId = this.config.get<string>('REVIEWER_PROFILE_ID');
    if (!configuredEmail || !configuredPassword || !profileId) {
      throw new ServiceUnavailableException(
        'El acceso de revisión no está configurado en este servidor.',
      );
    }

    // Timing-safe email comparison — use fixed-length SHA-256 digests to avoid
    // length-dependent timing leaks on the raw strings.
    const emailMatches = timingSafeEqualStrings(dto.email, configuredEmail);
    const passwordMatches = timingSafeEqualStrings(dto.password, configuredPassword);

    if (!emailMatches || !passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const token = this.reviewerTokenService.mint(profileId);

    return {
      success: true,
      data: { token, expiresInSeconds: ReviewerTokenService.EXPIRY_SECONDS },
    };
  }
}
