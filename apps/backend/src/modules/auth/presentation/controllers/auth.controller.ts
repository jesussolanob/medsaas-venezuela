import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  ResolveIdentityDtoSchema,
  type ResolveIdentityDto,
  type ResolveIdentityOutputDto,
} from '../../application/dtos/resolve-identity.dto';
import { ResolveIdentityUseCase } from '../../application/use-cases/resolve-identity.use-case';
import { INTERNAL_AUTH_SECRET_HEADER } from '../../infrastructure/guards/internal-secret.guard';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * AuthController
 *
 * Exposes POST /api/auth/resolve-identity — a machine-to-machine endpoint called
 * by the Next.js BFF after a successful Auth0 login. Intentionally has NO
 * DevAuthGuard: the caller authenticates via x-internal-auth-secret instead.
 *
 * Security contract enforced inside ResolveIdentityUseCase:
 *   - 503 when AUTH_RESOLVE_SECRET env is not configured (fail-closed)
 *   - 401 when the header is missing or wrong
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly resolveIdentityUseCase: ResolveIdentityUseCase) {}

  @Post('resolve-identity')
  @HttpCode(HttpStatus.OK)
  async resolveIdentity(
    @Headers(INTERNAL_AUTH_SECRET_HEADER) callerSecret: string | undefined,
    @Body(new ZodValidationPipe(ResolveIdentityDtoSchema)) dto: ResolveIdentityDto,
  ): Promise<SuccessResponse<ResolveIdentityOutputDto>> {
    const data = await this.resolveIdentityUseCase.execute(dto, callerSecret);
    return { success: true, data };
  }
}
