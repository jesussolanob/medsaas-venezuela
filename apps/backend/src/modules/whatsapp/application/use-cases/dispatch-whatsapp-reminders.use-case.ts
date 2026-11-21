import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REMINDERS_QUEUE_REPOSITORY,
  type IRemindersQueueRepository,
  type AppointmentDueRowWhatsApp,
} from '../../../reminders/domain/repositories/reminders-queue.repository';
import {
  WHATSAPP_SENDER,
  type IWhatsAppSender,
  type TemplateButtonParam,
} from '../../domain/ports/iwhatsapp-sender.port';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { AppointmentActionTokenService } from '../../infrastructure/services/appointment-action-token.service';
import { buildDoctorDisplayName } from '../../../document-sharing/application/utils/build-doctor-display-name';

export interface DispatchWhatsAppRemindersResult {
  sent24h: number;
  failed24h: number;
  skipped24h: number;
  sent3h: number;
  failed3h: number;
  skipped3h: number;
}

const DISPATCH_CAP = 240;
/** Meta Tier 250 — max unique recipients per rolling 24 h */
const DAILY_CAP = 240;

const TEMPLATE_24H_UNPAID = 'recordatorio_cita_24h';
const TEMPLATE_24H_PAID = 'recordatorio_cita_24h_pagada';
const TEMPLATE_3H = 'recordatorio_cita_hoy';
const TEMPLATE_LANG = 'es';

/**
 * DispatchWhatsAppRemindersUseCase
 *
 * Called by the cron endpoint (every 15 min) to send WhatsApp reminder messages
 * via Zernio for upcoming appointments.
 *
 * Windows:
 *   24h → scheduled_at ∈ [now+23h45m, now+24h15m], offset_type='24h'
 *    3h → scheduled_at ∈ [now+2h45m, now+3h15m],  offset_type='3h'
 *
 * Template selection (24h only):
 *   payment_status='approved'  → recordatorio_cita_24h_pagada (no cancel button)
 *   anything else              → recordatorio_cita_24h (with confirm/reschedule/cancel)
 *
 * PII policy:
 *   - Logger NEVER emits phone numbers, patient names, or appointment IDs.
 *   - Only aggregate counts and error codes are logged.
 */
@Injectable()
export class DispatchWhatsAppRemindersUseCase {
  private readonly logger = new Logger(DispatchWhatsAppRemindersUseCase.name);
  private readonly appBaseUrl: string;

  constructor(
    @Inject(REMINDERS_QUEUE_REPOSITORY)
    private readonly queueRepo: IRemindersQueueRepository,
    @Inject(WHATSAPP_SENDER)
    private readonly whatsApp: IWhatsAppSender,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    @Optional()
    private readonly tokenService: AppointmentActionTokenService | null,
    private readonly config: ConfigService,
  ) {
    this.appBaseUrl = (config.get<string>('APP_BASE_URL') ?? '').replace(/\/+$/, '');
  }

  async execute(): Promise<DispatchWhatsAppRemindersResult> {
    const now = new Date();

    // Respect daily Tier 250 cap before dispatching
    const usedToday = await this.queueRepo.countWhatsAppUniqueRecipientsLast24h();
    if (usedToday >= DAILY_CAP) {
      this.logger.warn(`[whatsapp] daily cap reached (${usedToday}/${DAILY_CAP}) — skipping run`);
      return { sent24h: 0, failed24h: 0, skipped24h: 0, sent3h: 0, failed3h: 0, skipped3h: 0 };
    }

    const remaining = DAILY_CAP - usedToday;

    // Run windows SEQUENTIALLY and share the budget so the combined sent count
    // never exceeds the daily cap.  Running them in parallel would let both
    // windows race against the same `remaining` budget and potentially exceed it.
    const r24h = await this.dispatch24h(now, Math.min(remaining, DISPATCH_CAP));
    const remaining3h = Math.max(0, remaining - r24h.sent);
    const r3h = await this.dispatch3h(now, Math.min(remaining3h, DISPATCH_CAP));

    return {
      sent24h: r24h.sent,
      failed24h: r24h.failed,
      skipped24h: r24h.skipped,
      sent3h: r3h.sent,
      failed3h: r3h.failed,
      skipped3h: r3h.skipped,
    };
  }

  // ---------------------------------------------------------------------------
  // 24h reminder — scheduled appointments, with quick-reply action buttons
  // ---------------------------------------------------------------------------

  private async dispatch24h(
    now: Date,
    cap: number,
  ): Promise<{ sent: number; failed: number; skipped: number }> {
    // Tolerant window: any appointment scheduled 3 h to 24 h from now is eligible.
    // The wide window means a delayed cron run still picks up appointments that
    // would have been missed with a tight ±15-min window.
    const windowStart = new Date(now.getTime() + 3 * 60 * 60 * 1000); // now + 3 h
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // now + 24 h

    const appointments = await this.queueRepo.findDueForWhatsAppReminder(
      '24h',
      windowStart,
      windowEnd,
      ['scheduled'],
      cap,
    );

    if (appointments.length === cap) {
      this.logger.warn(`[whatsapp-24h] cap reached (${cap}). Some may defer to next run.`);
    }

    const doctorMap = await this.buildDoctorNameMap(appointments);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const appt of appointments) {
      try {
        const outcome = await this.send24h(appt, doctorMap, now);
        if (outcome === 'sent') sent++;
        else if (outcome === 'failed') failed++;
        else skipped++;
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[whatsapp-24h] unhandled error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.debug(`[whatsapp-24h] sent=${sent} failed=${failed} skipped=${skipped}`);
    return { sent, failed, skipped };
  }

  private async send24h(
    appt: AppointmentDueRowWhatsApp,
    doctorMap: Map<string, string>,
    now: Date,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    if (!appt.patientPhone) return 'skipped';

    // Respect the doctor's quiet hours — do not send during their configured
    // no-disturbance window (applied to the CURRENT dispatch time, not the
    // appointment time).
    if (this.isInQuietHours(appt.quietHoursStart, appt.quietHoursEnd, now)) {
      return 'skipped';
    }

    // Insert idempotency row (ON CONFLICT DO NOTHING → returns null if already queued)
    const rowId = await this.queueRepo.insertPending({
      appointmentId: appt.appointmentId,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      offsetType: '24h',
      scheduledFor: appt.scheduledAt,
      channel: 'whatsapp',
    });

    if (!rowId) return 'skipped';

    const isPaid = appt.consultationPaymentStatus === 'approved';
    const templateName = isPaid ? TEMPLATE_24H_PAID : TEMPLATE_24H_UNPAID;
    const params = this.buildTemplateParams(appt, doctorMap);
    const buttonParams = isPaid ? undefined : this.build24hButtonParams(appt);

    try {
      const result = await this.whatsApp.sendTemplate({
        participantId: appt.patientPhone,
        templateName,
        templateLanguage: TEMPLATE_LANG,
        templateParams: params,
        templateButtonParams: buttonParams,
      });

      if (!result) {
        // null means gated/disabled — not a real failure
        await this.queueRepo.markFailed(rowId, 'gated_or_disabled');
        return 'skipped';
      }

      await this.queueRepo.updateExternalIds(rowId, result.messageId, result.conversationId);
      await this.queueRepo.markSent(rowId);
      return 'sent';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.queueRepo.markFailed(rowId, msg);
      return 'failed';
    }
  }

  // ---------------------------------------------------------------------------
  // 3h reminder — today's appointments (scheduled OR confirmed), no action buttons
  // ---------------------------------------------------------------------------

  private async dispatch3h(
    now: Date,
    cap: number,
  ): Promise<{ sent: number; failed: number; skipped: number }> {
    // Tolerant window: any appointment scheduled 30 min to 3 h from now is eligible.
    // This window is non-overlapping with the 24h window (which ends at now+24h,
    // starts at now+3h), so the same appointment cannot receive both reminders.
    const windowStart = new Date(now.getTime() + 30 * 60 * 1000); // now + 30 min
    const windowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000); // now + 3 h

    const appointments = await this.queueRepo.findDueForWhatsAppReminder(
      '3h',
      windowStart,
      windowEnd,
      ['scheduled', 'confirmed'],
      cap,
    );

    if (appointments.length === cap) {
      this.logger.warn(`[whatsapp-3h] cap reached (${cap}). Some may defer to next run.`);
    }

    const doctorMap = await this.buildDoctorNameMap(appointments);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const appt of appointments) {
      try {
        const outcome = await this.send3h(appt, doctorMap, now);
        if (outcome === 'sent') sent++;
        else if (outcome === 'failed') failed++;
        else skipped++;
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[whatsapp-3h] unhandled error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.debug(`[whatsapp-3h] sent=${sent} failed=${failed} skipped=${skipped}`);
    return { sent, failed, skipped };
  }

  private async send3h(
    appt: AppointmentDueRowWhatsApp,
    doctorMap: Map<string, string>,
    now: Date,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    if (!appt.patientPhone) return 'skipped';

    if (this.isInQuietHours(appt.quietHoursStart, appt.quietHoursEnd, now)) {
      return 'skipped';
    }

    const rowId = await this.queueRepo.insertPending({
      appointmentId: appt.appointmentId,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      offsetType: '3h',
      scheduledFor: appt.scheduledAt,
      channel: 'whatsapp',
    });

    if (!rowId) return 'skipped';

    const params = this.buildTemplateParams(appt, doctorMap);

    try {
      const result = await this.whatsApp.sendTemplate({
        participantId: appt.patientPhone,
        templateName: TEMPLATE_3H,
        templateLanguage: TEMPLATE_LANG,
        templateParams: params,
      });

      if (!result) {
        await this.queueRepo.markFailed(rowId, 'gated_or_disabled');
        return 'skipped';
      }

      await this.queueRepo.updateExternalIds(rowId, result.messageId, result.conversationId);
      await this.queueRepo.markSent(rowId);
      return 'sent';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.queueRepo.markFailed(rowId, msg);
      return 'failed';
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildTemplateParams(
    appt: AppointmentDueRowWhatsApp,
    doctorMap: Map<string, string>,
  ): string[] {
    const firstName = (appt.patientName ?? '').split(' ')[0] || 'Paciente';
    const doctorName = doctorMap.get(appt.doctorId) ?? 'Su especialista';
    const time = appt.scheduledAt.toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
    });
    // {{4}}: 'consulta en línea' for online appointments; office name otherwise.
    const officeName =
      appt.appointmentMode === 'online'
        ? 'consulta en línea'
        : (appt.officeName ?? 'su consultorio');
    return [firstName, doctorName, time, officeName];
  }

  // ---------------------------------------------------------------------------
  // Quiet-hours helper
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the given `now` falls within the doctor's configured
   * quiet-hours window (applied in the America/Caracas timezone).
   *
   * quietStart / quietEnd are stored as 'HH:MM:SS' strings (e.g. '21:00:00').
   * When quietStart > quietEnd the window crosses midnight (e.g. 21:00–08:00).
   */
  private isInQuietHours(quietStart: string | null, quietEnd: string | null, now: Date): boolean {
    if (!quietStart || !quietEnd) return false;

    // Extract the current time-of-day string ('HH:MM:SS') in Caracas timezone.
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const s = parts.find((p) => p.type === 'second')?.value ?? '00';
    const currentTime = `${h}:${m}:${s}`;

    if (quietStart > quietEnd) {
      // Window crosses midnight: quiet when time >= start OR time < end.
      // E.g. 21:00:00–08:00:00 → quiet at 22:00, 00:00, 07:59.
      return currentTime >= quietStart || currentTime < quietEnd;
    } else {
      // Same-day window: quiet when start <= time < end.
      return currentTime >= quietStart && currentTime < quietEnd;
    }
  }

  /**
   * Builds quick-reply button params for the 24h UNPAID template.
   * Buttons: Confirmar (index 0), Reagendar (index 1), Cancelar (index 2).
   * Each carries an HMAC-signed action token.
   */
  private build24hButtonParams(appt: AppointmentDueRowWhatsApp): TemplateButtonParam[] | undefined {
    if (!this.tokenService) return undefined;

    const expMs = appt.scheduledAt.getTime();
    const satMs = appt.scheduledAt.getTime();

    const confirmPayload = this.tokenService.generateButtonPayload({
      appointmentId: appt.appointmentId,
      expMs,
      action: 'confirm',
      satMs: 0,
    });

    const reschedulePayload = this.tokenService.generateButtonPayload({
      appointmentId: appt.appointmentId,
      expMs,
      action: 'reschedule',
      satMs,
    });

    const cancelPayload = this.tokenService.generateButtonPayload({
      appointmentId: appt.appointmentId,
      expMs,
      action: 'cancel',
      satMs: 0,
    });

    return [
      {
        index: 0,
        subType: 'quick_reply',
        parameters: [{ type: 'payload', payload: confirmPayload }],
      },
      {
        index: 1,
        subType: 'quick_reply',
        parameters: [{ type: 'payload', payload: reschedulePayload }],
      },
      {
        index: 2,
        subType: 'quick_reply',
        parameters: [{ type: 'payload', payload: cancelPayload }],
      },
    ];
  }

  private async buildDoctorNameMap(
    appointments: AppointmentDueRowWhatsApp[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(appointments.map((a) => a.doctorId))];
    const entries = await Promise.all(
      uniqueIds.map(async (doctorId) => {
        const profile = await this.doctorProfileRepo.findByDoctorId(doctorId);
        return [doctorId, buildDoctorDisplayName(profile)] as const;
      }),
    );
    return new Map(entries);
  }
}
