import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  ResolveIdentityDtoSchema,
  type ResolveIdentityDto,
  type ResolveIdentityOutputDto,
} from '../../application/dtos/resolve-identity.dto';
import { ResolveIdentityUseCase } from '../../application/use-cases/resolve-identity.use-case';
import { ProcessLoginTouchUseCase } from '../../application/use-cases/process-login-touch.use-case';
import type { ProcessLoginTouchOutput } from '../../application/use-cases/process-login-touch.use-case';
import { INTERNAL_AUTH_SECRET_HEADER } from '../../infrastructure/guards/internal-secret.guard';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';

interface SuccessResponse<T> {
  success: true;
  data: T;
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
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly resolveIdentityUseCase: ResolveIdentityUseCase,
    private readonly processLoginTouchUseCase: ProcessLoginTouchUseCase,
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
}
