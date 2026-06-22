import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../../../../email/application/services/mailer.service';

export type ReminderOffset = '24h' | '3h' | '7d';

export interface AppointmentReminderData {
  /** Patient display name — used in the template. */
  patientName: string;
  /** Doctor display name — used in the template. */
  doctorName: string;
  /** Human-readable appointment date (e.g. "lunes, 9 de junio de 2026"). */
  date: string;
  /** Human-readable appointment time (e.g. "10:00 AM"). */
  time: string;
  /** Recipient email address — patient or whoever should receive the reminder. */
  recipientEmail: string;
}

/**
 * SendReminderEmailUseCase — dispatches an appointment reminder email.
 *
 * This use case is intentionally standalone so it can be called by any future
 * scheduler/cron job without coupling to the appointment domain.
 * It maps the `offset` parameter to the correct template name:
 *   '7d'  → reminder_7d
 *   '24h' → reminder_24h
 *   '3h'  → reminder_3h
 *
 * NOTE: This use case is registered but not wired to any cron yet (2026-06-08).
 * A scheduler that queries upcoming appointments and calls execute() per appointment
 * will be implemented in a future sprint. The templates are already seeded by
 * migration 20260608000002-email-templates-seed.cjs.
 *
 * SECURITY:
 *   - Do NOT log patientName, recipientEmail, or any appointment-level PII.
 *   - Only offset and a non-identifying marker are logged.
 */
@Injectable()
export class SendReminderEmailUseCase {
  private readonly logger = new Logger(SendReminderEmailUseCase.name);

  private static readonly TEMPLATE_MAP: Record<ReminderOffset, string> = {
    '7d': 'reminder_7d',
    '24h': 'reminder_24h',
    '3h': 'reminder_3h',
  };

  constructor(private readonly mailerService: MailerService) {}

  /**
   * Sends an appointment reminder email.
   *
   * Email failure is non-fatal — errors are logged without PII and swallowed
   * so a cron loop continues processing remaining appointments.
   *
   * @returns true when the email was dispatched, false when suppressed/failed.
   */
  async execute(data: AppointmentReminderData, offset: ReminderOffset): Promise<boolean> {
    const templateName = SendReminderEmailUseCase.TEMPLATE_MAP[offset];

    try {
      await this.mailerService.sendTemplate(
        templateName,
        data.recipientEmail,
        {
          patientName: data.patientName,
          doctorName: data.doctorName,
          date: data.date,
          time: data.time,
        },
        { type: 'patient', id: null },
      );

      this.logger.debug(`[reminder] dispatched offset=${offset}`);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`[reminder] email failed offset=${offset}: ${message}`);
      return false;
    }
  }
}
