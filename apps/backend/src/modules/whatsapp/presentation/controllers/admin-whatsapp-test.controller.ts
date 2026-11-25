import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { SendTestWhatsAppReminderUseCase } from '../../application/use-cases/send-test-whatsapp-reminder.use-case';
import type { SendTestWhatsAppReminderResult } from '../../application/use-cases/send-test-whatsapp-reminder.use-case';

/**
 * Input schema for the test-reminder endpoint.
 * Validated via ZodValidationPipe before reaching the use case.
 */
const TestReminderSchema = z.object({
  appointmentId: z.string().uuid({ message: 'appointmentId debe ser un UUID válido' }),
  type: z.enum(['24h', '3h'], {
    error: 'type debe ser "24h" o "3h"',
  }),
});

type TestReminderInput = z.infer<typeof TestReminderSchema>;

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
 *   - Input validated with Zod (UUID + enum) before reaching the use case.
 */
@Controller('admin/whatsapp')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminWhatsAppTestController {
  constructor(private readonly sendTestReminder: SendTestWhatsAppReminderUseCase) {}

  @Post('test-reminder')
  @HttpCode(HttpStatus.OK)
  async testReminder(
    @Body(new ZodValidationPipe(TestReminderSchema)) body: TestReminderInput,
  ): Promise<SuccessResponse<SendTestWhatsAppReminderResult>> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Este endpoint no está disponible en este entorno.');
    }

    const result = await this.sendTestReminder.execute(body);
    return { success: true, data: result };
  }
}
