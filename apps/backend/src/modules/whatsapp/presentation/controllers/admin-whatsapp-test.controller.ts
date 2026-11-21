import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { SendTestWhatsAppReminderUseCase } from '../../application/use-cases/send-test-whatsapp-reminder.use-case';
import type {
  SendTestWhatsAppReminderInput,
  SendTestWhatsAppReminderResult,
} from '../../application/use-cases/send-test-whatsapp-reminder.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * AdminWhatsAppTestController
 *
 * POST /api/admin/whatsapp/test-reminder — staging-only test trigger.
 * Sends a WhatsApp reminder for a given appointment without writing a queue row.
 *
 * Security:
 *   - Requires super_admin role.
 *   - Only available in non-production environments (NODE_ENV check).
 *   - In production: returns 403 immediately.
 */
@Controller('admin/whatsapp')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminWhatsAppTestController {
  constructor(private readonly sendTestReminder: SendTestWhatsAppReminderUseCase) {}

  @Post('test-reminder')
  @HttpCode(HttpStatus.OK)
  async testReminder(
    @Body() body: SendTestWhatsAppReminderInput,
  ): Promise<SuccessResponse<SendTestWhatsAppReminderResult>> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('This endpoint is not available in production');
    }

    const result = await this.sendTestReminder.execute(body);
    return { success: true, data: result };
  }
}
