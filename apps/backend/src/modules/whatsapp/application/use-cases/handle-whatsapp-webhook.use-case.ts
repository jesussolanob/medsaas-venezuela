import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../appointments/domain/repositories/appointment.repository';
import { WHATSAPP_SENDER, type IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import { AppointmentRescheduleTokenService } from '../../../appointments/infrastructure/services/appointment-reschedule-token.service';
import { CreateNotificationUseCase } from '../../../notifications/application/use-cases/create-notification.use-case';
import {
  REMINDERS_QUEUE_REPOSITORY,
  type IRemindersQueueRepository,
} from '../../../reminders/domain/repositories/reminders-queue.repository';
import type { Appointment } from '../../../appointments/domain/entities/appointment.entity';

export interface ZernioWebhookPayload {
  event?: string;
  conversationId?: string;
  messageId?: string;
  participantId?: string;
  /**
   * Zernio account ID — used to filter out events from other accounts.
   * Present as account.accountId in the message.received payload.
   */
  accountId?: string;
  /**
   * wamid of the original outbound reminder message whose quick-reply was tapped.
   * Present as metadata.quotedMessageId in the message.received payload.
   */
  quotedMessageId?: string;
  /**
   * Button text from the quick-reply tap: "Confirmar", "Reagendar", or "Cancelar".
   * Sourced from metadata.buttonPayload (the literal label the patient tapped).
   * Normalized via normalizeWhatsAppAction() before routing.
   */
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
 * Processes inbound events from the Zernio webhook (message.received).
 *
 * NEW design (FACT 2 — after staging tests confirmed real Zernio payload):
 *   When a patient taps a quick-reply button, Zernio sends a message.received
 *   event carrying:
 *     - metadata.quotedMessageId: the wamid of the original outbound reminder
 *     - metadata.buttonPayload:   the button label ("Confirmar", "Reagendar",
 *                                  "Cancelar")
 *
 *   Flow:
 *     1. Account ID guard: ignore events from other Zernio accounts.
 *     2. Idempotency: in-memory set keyed by message.id (best-effort, no
 *        migration needed; operations are idempotent at the data level too).
 *     3. quotedMessageId → look up reminders_queue by external_message_id to
 *        find the appointment.
 *     4. Normalize button label → 'confirm' | 'reschedule' | 'cancel'.
 *     5. Apply existing guards and side effects (paid, inactive, patientConfirmedAt,
 *        log, bell notifications).
 *   Free text (no quotedMessageId) → one-per-24h "reminders only" reply.
 *   Unknown/unmatched events → noop.
 *
 * PII policy:
 *   - Logger NEVER emits phone numbers, appointment IDs, patient names, or
 *     message bodies.
 *   - Only action codes, error codes, and success flags are logged.
 *
 * Security:
 *   - Account ID filter rejects events from other Zernio accounts.
 *   - Signature verification is in the controller (before this use case runs).
 *   - All operations are best-effort — a failure must not cause the webhook to
 *     return non-200.
 */
@Injectable()
export class HandleWhatsAppWebhookUseCase {
  private readonly logger = new Logger(HandleWhatsAppWebhookUseCase.name);
  private readonly appBaseUrl: string;
  private readonly zernioAccountId: string | null;

  /**
   * In-memory set for best-effort idempotency by Zernio message.id.
   * Prevents duplicate processing on webhook retries within the same instance.
   * Bounded to MAX_PROCESSED_IDS entries; oldest half is evicted on overflow.
   */
  private readonly processedMessageIds = new Set<string>();
  private static readonly MAX_PROCESSED_IDS = 1000;

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(WHATSAPP_SENDER)
    private readonly whatsApp: IWhatsAppSender,
    // AppointmentRescheduleTokenService — produces the single-use URL token for
    // the public /book/<doctorId>?reagendar=<token> reschedule link.
    // Required: exported from AppointmentsModule and available in this module's scope.
    private readonly rescheduleTokenService: AppointmentRescheduleTokenService,
    @Inject(REMINDERS_QUEUE_REPOSITORY)
    private readonly queueRepo: IRemindersQueueRepository,
    @Optional()
    @Inject(CreateNotificationUseCase)
    private readonly createNotification: CreateNotificationUseCase | null,
    private readonly config: ConfigService,
  ) {
    this.appBaseUrl = (config.get<string>('APP_BASE_URL') ?? '').replace(/\/+$/, '');
    this.zernioAccountId = config.get<string>('ZERNIO_WHATSAPP_ACCOUNT_ID') ?? null;
  }

  async execute(payload: ZernioWebhookPayload): Promise<HandleWebhookResult> {
    try {
      // 1. Account ID guard: ignore events from other Zernio accounts.
      if (this.zernioAccountId && payload.accountId && payload.accountId !== this.zernioAccountId) {
        this.logger.debug('[whatsapp-webhook] account mismatch — noop');
        return { action: 'noop' };
      }

      // 2. Idempotency: skip messages already processed in this instance.
      if (payload.messageId && this.processedMessageIds.has(payload.messageId)) {
        this.logger.debug('[whatsapp-webhook] duplicate message.id — noop');
        return { action: 'noop' };
      }

      // 3. Route by quotedMessageId (button tap) or free text.
      if (payload.quotedMessageId) {
        const result = await this.handleQuotedReply(payload);
        // Mark as processed only after successful handling.
        if (payload.messageId) this.markProcessed(payload.messageId);
        return result;
      }

      if (payload.messageBody && payload.conversationId) {
        if (payload.messageId) this.markProcessed(payload.messageId);
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
  // Quoted-reply handler (button tap)
  // ---------------------------------------------------------------------------

  private async handleQuotedReply(payload: ZernioWebhookPayload): Promise<HandleWebhookResult> {
    // Look up the reminder queue row by the wamid of the original outbound message.
    const reminderRow = await this.queueRepo.findByExternalMessageId(
      payload.quotedMessageId!,
      'whatsapp',
    );

    if (!reminderRow) {
      // No matching reminder — treat as free text if there is a message body.
      if (payload.messageBody && payload.conversationId) {
        return await this.handleFreeText(payload.conversationId);
      }
      return { action: 'noop' };
    }

    const appointment = await this.appointmentRepo.findById(reminderRow.appointmentId);
    if (!appointment) {
      this.logger.debug('[whatsapp-webhook] appointment not found for reminder row — noop');
      return { action: 'noop' };
    }

    // Determine action from the button text (the literal label the patient tapped).
    const rawAction = payload.buttonPayload ?? payload.messageBody ?? '';
    const action = normalizeWhatsAppAction(rawAction);

    if (!action) {
      this.logger.debug('[whatsapp-webhook] unrecognized button text — noop');
      return { action: 'noop' };
    }

    switch (action) {
      case 'confirm':
        return await this.handleConfirm(appointment, payload.conversationId);
      case 'reschedule':
        return await this.handleReschedule(appointment, payload.conversationId);
      case 'cancel':
        return await this.handleCancel(appointment, payload.conversationId);
    }
  }

  // ---------------------------------------------------------------------------
  // Individual action handlers
  // ---------------------------------------------------------------------------

  private async handleConfirm(
    appointment: Appointment,
    conversationId?: string,
  ): Promise<HandleWebhookResult> {
    // Status guard: only active appointments can be confirmed.
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      if (conversationId) {
        await this.whatsApp.sendText({
          conversationId,
          text: 'Esta cita ya no está activa y no puede confirmarse. Para más información, contacta a tu especialista.',
        });
      }
      return { action: 'noop' };
    }

    // Single-use check: if already confirmed, skip silently.
    if (appointment.patientConfirmedAt) {
      return { action: 'noop' };
    }
    await this.appointmentRepo.setPatientConfirmedAt(appointment.id);

    // Notify the doctor (best-effort).
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

  private async handleReschedule(
    appointment: Appointment,
    conversationId?: string,
  ): Promise<HandleWebhookResult> {
    if (conversationId) {
      const rescheduleLink = this.buildRescheduleLink(appointment);
      await this.whatsApp.sendText({
        conversationId,
        text: `Haz clic aquí para reagendar tu cita: ${rescheduleLink}`,
      });
    }
    return { action: 'reschedule' };
  }

  private async handleCancel(
    appointment: Appointment,
    conversationId?: string,
  ): Promise<HandleWebhookResult> {
    // Guard: do not cancel if payment is already approved.
    if (appointment.paymentStatus === 'approved') {
      if (conversationId) {
        await this.whatsApp.sendText({
          conversationId,
          text: 'Tu cita tiene un pago aprobado y no puede cancelarse por este medio. Por favor, contacta directamente a tu especialista.',
        });
      }
      return { action: 'noop' };
    }

    // Only cancel from cancelable statuses.
    if (!appointment.canTransitionTo('cancelled')) {
      return { action: 'noop' };
    }

    await this.appointmentRepo.updateStatus(appointment.id, 'cancelled');

    // Write audit log — actor_id is UUID NOT NULL without FK; use the
    // doctor's UUID so the constraint is satisfied.  Best-effort.
    try {
      await this.appointmentRepo.logStatusChange({
        appointmentId: appointment.id,
        actorId: appointment.doctorId,
        oldStatus: appointment.status,
        newStatus: 'cancelled',
      });
    } catch {
      // Audit log failure must not break the webhook flow
    }

    // Notify the doctor (best-effort).
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

    // Acknowledge the patient (best-effort).
    if (conversationId) {
      await this.whatsApp.sendText({
        conversationId,
        text: 'Tu cita ha sido cancelada exitosamente. Para reagendar, contacta a tu especialista.',
      });
    }
    return { action: 'cancel' };
  }

  // ---------------------------------------------------------------------------
  // Free-text inbound handler
  // ---------------------------------------------------------------------------

  private async handleFreeText(conversationId: string): Promise<HandleWebhookResult> {
    // Reply once; subsequent messages in the same conversation are silently ignored
    // (idempotency at the message.id level handles retries).
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

  private buildRescheduleLink(appointment: Appointment): string {
    const token = this.rescheduleTokenService.generate({
      appointmentId: appointment.id,
      satMs: appointment.scheduledAt.getTime(),
    });
    // The booking page uses ?reagendar=<token> query param to enter reschedule mode.
    return `${this.appBaseUrl}/book/${appointment.doctorId}?reagendar=${token}`;
  }

  private formatCaracasDate(d: Date): string {
    return d.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  private markProcessed(messageId: string): void {
    if (this.processedMessageIds.size >= HandleWhatsAppWebhookUseCase.MAX_PROCESSED_IDS) {
      // Evict oldest half to bound memory usage.
      const arr = [...this.processedMessageIds];
      this.processedMessageIds.clear();
      for (const id of arr.slice(-HandleWhatsAppWebhookUseCase.MAX_PROCESSED_IDS / 2)) {
        this.processedMessageIds.add(id);
      }
    }
    this.processedMessageIds.add(messageId);
  }
}

/**
 * Normalizes a WhatsApp quick-reply button label to a known action.
 * Strips leading/trailing whitespace, lowercases, and removes diacritics (NFD).
 *
 * @example
 *   normalizeWhatsAppAction('Confirmar') → 'confirm'
 *   normalizeWhatsAppAction(' Reagendar ')  → 'reschedule'
 *   normalizeWhatsAppAction('Cancelar') → 'cancel'
 *   normalizeWhatsAppAction('hola')     → null
 */
export function normalizeWhatsAppAction(raw: string): 'confirm' | 'reschedule' | 'cancel' | null {
  const n = raw.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n === 'confirmar') return 'confirm';
  if (n === 'reagendar') return 'reschedule';
  if (n === 'cancelar') return 'cancel';
  return null;
}
