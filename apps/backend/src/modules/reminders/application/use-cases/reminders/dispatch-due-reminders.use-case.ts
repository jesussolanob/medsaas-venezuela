import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  REMINDERS_QUEUE_REPOSITORY,
  type IRemindersQueueRepository,
  type AppointmentDueRow,
} from '../../../domain/repositories/reminders-queue.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { AppointmentConfirmTokenService } from '../../../../appointments/infrastructure/services/appointment-confirm-token.service';
import { ConfigService } from '@nestjs/config';

export interface DispatchDueRemindersResult {
  sent24h: number;
  failed24h: number;
  sent1h: number;
  failed1h: number;
}

const DISPATCH_CAP = 200;

/**
 * DispatchDueRemindersUseCase
 *
 * Scheduled use case — triggered by POST /api/cron/appointment-reminders.
 * Expected to run every 15 minutes via Cloud Scheduler.
 *
 * For each supported offset type ('24h', '1h') it:
 *   1. Finds appointments within the time window (using per-doctor settings).
 *   2. Pre-resolves doctor names in a single pass over unique doctorIds to avoid
 *      N+1 queries inside the per-appointment loop.
 *   3. Inserts a pending row (idempotent ON CONFLICT DO NOTHING via DB UNIQUE).
 *   4. Sends the appropriate email template.
 *   5. Marks the row sent or failed.
 *
 * Each appointment is wrapped in try/catch so a single failure does not abort
 * the entire batch. A cap of 200 per offset type per run prevents runaway work.
 *
 * SECURITY / PII:
 *   - Logger never emits patient email, name, or appointment details.
 *   - The confirm URL embeds only the HMAC token (no raw appointmentId).
 *
 * TODO (v2): apply quiet_hours to the 24h reminder window.
 * The 1h reminder ignores quiet hours by design (urgency).
 */
@Injectable()
export class DispatchDueRemindersUseCase {
  private readonly logger = new Logger(DispatchDueRemindersUseCase.name);

  constructor(
    @Inject(REMINDERS_QUEUE_REPOSITORY)
    private readonly queueRepo: IRemindersQueueRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly mailer: MailerService,
    private readonly tokenService: AppointmentConfirmTokenService,
    private readonly config: ConfigService,
  ) {}

  async execute(): Promise<DispatchDueRemindersResult> {
    const now = new Date();

    const [r24h, r1h] = await Promise.all([this.dispatch24h(now), this.dispatch1h(now)]);

    return {
      sent24h: r24h.sent,
      failed24h: r24h.failed,
      sent1h: r1h.sent,
      failed1h: r1h.failed,
    };
  }

  // ---------------------------------------------------------------------------
  // 24h reminder — scheduled appointments, confirmation link included
  // ---------------------------------------------------------------------------

  private async dispatch24h(now: Date): Promise<{ sent: number; failed: number }> {
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000); // now+23h45m
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 15 * 60 * 1000); // now+24h15m

    const appointments = await this.queueRepo.findDueForReminder(
      '24h',
      windowStart,
      windowEnd,
      ['scheduled'],
      DISPATCH_CAP,
    );

    if (appointments.length === DISPATCH_CAP) {
      this.logger.warn(
        `[dispatch-24h] cap reached (${DISPATCH_CAP} appointments). Some may be deferred to next run.`,
      );
    }

    // Pre-resolve doctor names for all unique doctorIds in a single pass —
    // avoids N+1 calls to doctorProfileRepo inside the per-appointment loop.
    const doctorNames = await this.buildDoctorNameMap(appointments);

    let sent = 0;
    let failed = 0;

    for (const appt of appointments) {
      try {
        const outcome = await this.send24h(appt, doctorNames);
        if (outcome === 'sent') sent++;
        if (outcome === 'failed') failed++;
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[dispatch-24h] unhandled error for appointment=${appt.appointmentId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.logger.debug(`[dispatch-24h] sent=${sent} failed=${failed}`);
    return { sent, failed };
  }

  private async send24h(
    appt: AppointmentDueRow,
    doctorNames: Map<string, string>,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    // Insert pending row first (idempotent — ON CONFLICT DO NOTHING)
    const rowId = await this.queueRepo.insertPending({
      appointmentId: appt.appointmentId,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      offsetType: '24h',
      scheduledFor: appt.scheduledAt,
      channel: 'email',
    });

    // rowId is null when the UNIQUE constraint already exists (already queued).
    if (!rowId) {
      return 'skipped';
    }

    const doctorName = doctorNames.get(appt.doctorId) ?? 'Su médico';
    const confirmUrl = this.buildConfirmUrl(appt.appointmentId);
    const { date, time } = this.formatCaracas(appt.scheduledAt);
    const patientName = appt.patientName ?? 'Paciente';

    try {
      await this.mailer.sendTemplate(
        'reminder_confirm_24h',
        appt.patientEmail,
        {
          patient_name: patientName,
          doctor_name: doctorName,
          date,
          time,
          confirm_url: confirmUrl,
        },
        { type: 'patient', id: appt.patientId },
      );
      await this.queueRepo.markSent(rowId);
      return 'sent';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.queueRepo.markFailed(rowId, msg);
      return 'failed';
    }
  }

  // ---------------------------------------------------------------------------
  // 1h reminder — scheduled OR confirmed, no confirmation link
  // ---------------------------------------------------------------------------

  private async dispatch1h(now: Date): Promise<{ sent: number; failed: number }> {
    const windowStart = new Date(now.getTime() + 45 * 60 * 1000); // now+45m
    const windowEnd = new Date(now.getTime() + 75 * 60 * 1000); // now+75m

    const appointments = await this.queueRepo.findDueForReminder(
      '1h',
      windowStart,
      windowEnd,
      ['scheduled', 'confirmed'],
      DISPATCH_CAP,
    );

    if (appointments.length === DISPATCH_CAP) {
      this.logger.warn(
        `[dispatch-1h] cap reached (${DISPATCH_CAP} appointments). Some may be deferred to next run.`,
      );
    }

    // Pre-resolve doctor names for all unique doctorIds in a single pass.
    const doctorNames = await this.buildDoctorNameMap(appointments);

    let sent = 0;
    let failed = 0;

    for (const appt of appointments) {
      try {
        const outcome = await this.send1h(appt, doctorNames);
        if (outcome === 'sent') sent++;
        if (outcome === 'failed') failed++;
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[dispatch-1h] unhandled error for appointment=${appt.appointmentId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.logger.debug(`[dispatch-1h] sent=${sent} failed=${failed}`);
    return { sent, failed };
  }

  private async send1h(
    appt: AppointmentDueRow,
    doctorNames: Map<string, string>,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    const rowId = await this.queueRepo.insertPending({
      appointmentId: appt.appointmentId,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      offsetType: '1h',
      scheduledFor: appt.scheduledAt,
      channel: 'email',
    });

    if (!rowId) {
      return 'skipped';
    }

    const doctorName = doctorNames.get(appt.doctorId) ?? 'Su médico';
    const { date, time } = this.formatCaracas(appt.scheduledAt);
    const patientName = appt.patientName ?? 'Paciente';

    try {
      await this.mailer.sendTemplate(
        'reminder_1h',
        appt.patientEmail,
        {
          patient_name: patientName,
          doctor_name: doctorName,
          date,
          time,
        },
        { type: 'patient', id: appt.patientId },
      );
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

  /**
   * Resolves display names for all unique doctorIds in the given appointment
   * list with a single Promise.all (one DB call per unique doctor, not per
   * appointment — avoids N+1 when many appointments share the same doctor).
   *
   * Returns a Map<doctorId, displayName> with 'Su médico' as the fallback.
   */
  private async buildDoctorNameMap(
    appointments: AppointmentDueRow[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(appointments.map((a) => a.doctorId))];
    const entries = await Promise.all(
      uniqueIds.map(async (doctorId) => {
        const profile = await this.doctorProfileRepo.findByDoctorId(doctorId);
        return [doctorId, profile?.fullName ?? 'Su médico'] as const;
      }),
    );
    return new Map(entries);
  }

  private buildConfirmUrl(appointmentId: string): string {
    const baseUrl = (this.config.get<string>('APP_BASE_URL') ?? '').replace(/\/+$/, '');
    const token = this.tokenService.generate(appointmentId);
    return `${baseUrl}/cita/confirmar/${token}`;
  }

  private formatCaracas(scheduledAt: Date): { date: string; time: string } {
    const date = scheduledAt.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = scheduledAt.toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
    });
    return { date, time };
  }
}
