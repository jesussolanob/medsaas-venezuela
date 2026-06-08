import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { EMAIL_PORT } from '../../application/ports/email.port';
import type { IEmailPort, EmailSendResult } from '../../application/ports/email.port';

interface TestEmailBody {
  to: string;
  subject?: string;
  html?: string;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * EmailController — smoke/dev endpoint for testing email delivery.
 *
 * Restricted to super_admin to prevent abuse.
 * NEVER used in production customer flows — use IEmailPort directly in use-cases.
 *
 * SECURITY:
 *   - Body is NOT logged (may contain PII or HTML content).
 *   - Only super_admin can invoke this endpoint.
 */
@Controller('email')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class EmailController {
  constructor(
    @Inject(EMAIL_PORT)
    private readonly emailPort: IEmailPort,
  ) {}

  /**
   * POST /api/email/test
   *
   * Sends a test email via the configured email adapter.
   * Returns the provider-assigned message ID (null for noop adapter).
   *
   * Body: { to: string; subject?: string; html?: string }
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testEmail(
    @Body() body: TestEmailBody,
  ): Promise<SuccessResponse<EmailSendResult>> {
    const result = await this.emailPort.send({
      to: body.to,
      subject: body.subject ?? 'Test email — Delta Medical CRM',
      html: body.html ?? '<p>Test email from Delta Medical CRM.</p>',
    });

    return { success: true, data: result };
  }
}
