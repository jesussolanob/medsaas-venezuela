import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../appointments/domain/repositories/appointment.repository';
import { WHATSAPP_SENDER, type IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import { AppointmentActionTokenService } from '../../infrastructure/services/appointment-action-token.service';
import { CreateNotificationUseCase } from '../../../notifications/application/use-cases/create-notification.use-case';

export interface ZernioWebhookPayload {
  event?: string;
  conversationId?: string;
  messageId?: string;
  participantId?: string;
  /** quick_reply button payload string: '{action}:{token}' */
  buttonPayload?: string;
  /** Free-text inbound message body (non-button message) */
  messageBody?: string;
}

export interface HandleWebhookResult {
  action: 'confirm' | 'reschedule' | 'cancel' | 'freetext' | 'noop';
}

const FREE_TEXT_REPLY =
  'Este número solo envía recordatorios de citas. Para gestionar tu cita, contacta a tu especialista directamente.';

/**
 * HandleWhatsAppWebhookUseCase
 *
 * Processes inbound events from the Zernio webhook:
 *   - button_reply → parses HMAC-signed payload, routes by action
 *     - confirm    → sets patient_confirmed_at on the appointment (no status change)
 *     - reschedule → replies with booking link {APP_BASE_URL}/book/{doctorId}?reagendar={token}
 *     - cancel     → cancels appointment if payment is NOT approved; otherwise replies
 *                    with a message telling the patient to call their doctor
 *   - inbound text → replies ONCE with a "this number only sends reminders" message
 *   - everything else → no-op (always returns 200 upstream)
 *
 * PII policy:
 *   - Logger NEVER emits phone numbers, appointment IDs, patient names, or message bodies.
 *   - Only action codes, error codes, and success flags are logged.
 *
 * Security:
 *   - HMAC token verification is performed by AppointmentActionTokenService.
 *   - Invalid / expired / tampered tokens → 'noop' (no error thrown, so webhook returns 200).
 *   - All operations are best-effort — a failure must not cause the webhook to return non-200.
 */
@Injectable()
export class HandleWhatsAppWebhookUseCase {
  private readonly logger = new Logger(HandleWhatsAppWebhookUseCase.name);
  private readonly appBaseUrl: string;

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(WHATSAPP_SENDER)
    private readonly whatsApp: IWhatsAppSender,
    private readonly tokenService: AppointmentActionTokenService,
    @Optional()
    @Inject(CreateNotificationUseCase)
    private readonly createNotification: CreateNotificationUseCase | null,
    private readonly config: ConfigService,
  ) {
    this.appBaseUrl = (config.get<string>('APP_BASE_URL') ?? '').replace(/\/+$/, '');
  }

  async execute(payload: ZernioWebhookPayload): Promise<HandleWebhookResult> {
    try {
      if (payload.buttonPayload) {
        return await this.handleButtonReply(payload);
      }

      if (payload.messageBody && payload.conversationId) {
        return await this.handleFreeText(payload.conversationId);
      }
    } catch (err: unknown) {
      // Never propagate — webhook must always return 200
      this.logger.warn(
        `[whatsapp-webhook] unhandled error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { action: 'noop' };
  }

  // ---------------------------------------------------------------------------
  // Button reply handler
  // ---------------------------------------------------------------------------

  private async handleButtonReply(payload: ZernioWebhookPayload): Promise<HandleWebhookResult> {
    const decoded = this.tokenService.verifyButtonPayload(payload.buttonPayload ?? '', new Date());

    if (!decoded) {
      this.logger.debug('[whatsapp-webhook] button payload invalid or expired — noop');
      return { action: 'noop' };
    }

    const appointment = await this.appointmentRepo.findById(decoded.appointmentId);
    if (!appointment) {
      this.logger.debug('[whatsapp-webhook] appointment not found — noop');
      return { action: 'noop' };
    }

    switch (decoded.action) {
      case 'confirm': {
        // Single-use check: if already confirmed, skip silently
        if (appointment.patientConfirmedAt) {
          return { action: 'noop' };
        }
        await this.appointmentRepo.setPatientConfirmedAt(appointment.id);

        // Notify the doctor (best-effort)
        if (this.createNotification) {
          try {
            await this.createNotification.execute({
              doctorId: appointment.doctorId,
              type: 'appointment_confirmed_by_patient',
              title: 'Cita confirmada por el paciente',
              body: `El paciente confirmó su asistencia a la cita del ${this.formatCaracasDate(appointment.scheduledAt)}.`,
              entityType: 'appointment',
              entityId: appointment.id,
            });
          } catch {
            // Notification failure must not break the webhook flow
          }
        }
        return { action: 'confirm' };
      }

      case 'reschedule': {
        // Single-use check: satMs must match current scheduledAt
        if (decoded.satMs !== appointment.scheduledAt.getTime()) {
          this.logger.debug('[whatsapp-webhook] reschedule token already used — noop');
          return { action: 'noop' };
        }

        if (payload.conversationId) {
          const bookingLink = `${this.appBaseUrl}/book/${appointment.doctorId}?reagendar=${payload.buttonPayload ?? ''}`;
          await this.whatsApp.sendText({
            conversationId: payload.conversationId,
            text: `Haz clic aquí para reagendar tu cita: ${bookingLink}`,
          });
        }
        return { action: 'reschedule' };
      }

      case 'cancel': {
        // Guard: do not cancel if payment is already approved
        if (appointment.paymentStatus === 'approved') {
          if (payload.conversationId) {
            await this.whatsApp.sendText({
              conversationId: payload.conversationId,
              text: 'Tu cita tiene un pago aprobado y no puede cancelarse por este medio. Por favor, contacta directamente a tu especialista.',
            });
          }
          return { action: 'noop' };
        }

        // Only cancel from cancelable statuses
        if (!appointment.canTransitionTo('cancelled')) {
          return { action: 'noop' };
        }

        await this.appointmentRepo.updateStatus(appointment.id, 'cancelled');

        // Notify the doctor (best-effort)
        if (this.createNotification) {
          try {
            await this.createNotification.execute({
              doctorId: appointment.doctorId,
              type: 'appointment_cancelled_by_patient',
              title: 'Cita cancelada por el paciente',
              body: `El paciente canceló la cita del ${this.formatCaracasDate(appointment.scheduledAt)} desde WhatsApp.`,
              entityType: 'appointment',
              entityId: appointment.id,
            });
          } catch {
            // Notification failure must not break the webhook flow
          }
        }

        // Acknowledge the patient (best-effort)
        if (payload.conversationId) {
          await this.whatsApp.sendText({
            conversationId: payload.conversationId,
            text: 'Tu cita ha sido cancelada exitosamente. Para reagendar, contacta a tu especialista.',
          });
        }
        return { action: 'cancel' };
      }

      default:
        return { action: 'noop' };
    }
  }

  // ---------------------------------------------------------------------------
  // Free-text inbound handler
  // ---------------------------------------------------------------------------

  private async handleFreeText(conversationId: string): Promise<HandleWebhookResult> {
    // Reply once; subsequent messages in the same conversation are silently ignored
    // (Zernio conversation deduplication is handled upstream).
    try {
      await this.whatsApp.sendText({ conversationId, text: FREE_TEXT_REPLY });
    } catch {
      // Failure on reply must not propagate
    }
    return { action: 'freetext' };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private formatCaracasDate(d: Date): string {
    return d.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
}
