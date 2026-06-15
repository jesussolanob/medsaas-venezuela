import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { CurrentUser } from '../../../../presentation/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { ConnectGoogleUseCase } from '../../application/use-cases/integrations/connect-google.use-case';
import { GetIntegrationStatusUseCase } from '../../application/use-cases/integrations/get-integration-status.use-case';
import { DisconnectGoogleUseCase } from '../../application/use-cases/integrations/disconnect-google.use-case';
import { ConnectGoogleSchema } from '../../application/dtos/integration.dtos';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import type { ConnectGoogleDto } from '../../application/dtos/integration.dtos';

/**
 * IntegrationsController — Google Calendar/Meet OAuth management.
 *
 * All endpoints require doctor authentication (DevAuthGuard).
 * doctorId is always taken from request.user.sub — never from the body (anti-IDOR).
 *
 * Endpoints:
 *   POST   /api/integrations/google/connect   { code }  → { connected, googleEmail }
 *   GET    /api/integrations/google/status              → { connected, googleEmail? }
 *   DELETE /api/integrations/google                     → 204
 */
@Controller('integrations/google')
@UseGuards(AppAuthGuard)
export class IntegrationsController {
  constructor(
    private readonly connectGoogle: ConnectGoogleUseCase,
    private readonly getStatus: GetIntegrationStatusUseCase,
    private readonly disconnectGoogle: DisconnectGoogleUseCase,
  ) {}

  /**
   * Exchanges an OAuth authorization code for Google tokens and saves the
   * integration. The frontend receives this code from the Google redirect.
   *
   * POST /api/integrations/google/connect
   */
  @Post('connect')
  async connect(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(ConnectGoogleSchema)) dto: ConnectGoogleDto,
  ) {
    const result = await this.connectGoogle.execute(user.sub, dto.code);
    return { success: true, data: result };
  }

  /**
   * Returns the current integration status for the authenticated doctor.
   * NEVER returns tokens.
   *
   * GET /api/integrations/google/status
   */
  @Get('status')
  async status(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.getStatus.execute(user.sub);
    return { success: true, data: result };
  }

  /**
   * Removes the Google integration for the authenticated doctor.
   *
   * DELETE /api/integrations/google
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.disconnectGoogle.execute(user.sub);
  }
}
