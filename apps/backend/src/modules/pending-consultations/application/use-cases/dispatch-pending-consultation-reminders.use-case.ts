import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../appointments/domain/repositories/appointment.repository';
import { MailerService } from '../../../email/application/services/mailer.service';
import { PendingConsultationTokenService } from '../services/pending-consultation-token.service';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';

/** Max pending consultations processed per cron invocation. */
const DISPATCH_CAP = 200;

/** Days after anchor before sending the first reminder (stage 0). */
const STAGE_0_DAYS = 3;

/** Days between weekly follow-up reminders (stage >= 1). */
const WEEKLY_DAYS = 7;

/** Days before expiry to send the final-warning override (stage sentinel = 1000). */
const FINAL_WARN_DAYS = 3;

/** Sentinel stage value used when the final-warning email has been sent. */
const FINAL_STAGE = 1000;

export interface DispatchPendingRemindersResult {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * DispatchPendingConsultationRemindersUseCase
 *
 * Escalated reminder logic for "consultas por agendar" (pending consultations).
 *
 * Called by the cron endpoint POST /api/cron/appointment-reminders every 15 min.
 *
 * Anchor-based escalation (idempotent, stage-gated):
 *
 *   Anchor = when session 1 was attended:
 *     - If paymentId is null → anchor = pending.createdAt (no payment, immediate)
 *     - If paymentId is set AND there is a completed appointment with that
 *       payment_id → anchor = that appointment's updatedAt
 *     - If paymentId is set but session 1 is NOT completed yet → SKIP (patient
 *       has not even attended their first session)
 *
 *   Stage 0  (initial):    now >= anchor + 3 days         → send, stage = 1
 *   Stage >= 1 (weekly):   now >= last_reminder_at + 7d   → send, stage++
 *   Final override:        expires_at != null
 *                          AND now >= expires_at − 3 days
 *                          AND stage < FINAL_STAGE         → send, stage = FINAL_STAGE
 *
 * Cap of 200 rows per run. PII is never logged.
 *
 * Template variable `expiresAtLabel`:
 *   Built here as a self-contained phrase so the template can use plain
 *   {{expiresAtLabel}} substitution without Handlebars conditionals:
 *     - When expires_at set  → "Válido hasta el <fecha es-VE>"
 *     - When no expires_at   → "" (empty string — the <p> renders empty)
 */
@Injectable()
export class DispatchPendingConsultationRemindersUseCase {
  private readonly logger = new Logger(DispatchPendingConsultationRemindersUseCase.name);

  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly pendingRepo: IPendingConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly mailer: MailerService,
    private readonly tokenService: PendingConsultationTokenService,
    private readonly config: ConfigService,
  ) {}

  async execute(nowOverride?: Date): Promise<DispatchPendingRemindersResult> {
    const now = nowOverride ?? new Date();
    const pending = await this.pendingRepo.findDueForReminder(DISPATCH_CAP);

    if (pending.length === DISPATCH_CAP) {
      this.logger.warn(
        `[pending-reminders] cap reached (${DISPATCH_CAP}). Some may be deferred to next run.`,
      );
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const pc of pending) {
      try {
        const outcome = await this.processOne(pc, now);
        if (outcome === 'sent') sent++;
        else if (outcome === 'skipped') skipped++;
        else failed++;
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[pending-reminders] unhandled error for pending=${pc.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.logger.log(`[pending-reminders] sent=${sent} skipped=${skipped} failed=${failed}`);
    return { sent, skipped, failed };
  }

  // ---------------------------------------------------------------------------
  // Core escalation logic (per pending consultation) — private
  // ---------------------------------------------------------------------------

  private async processOne(
    pc: PendingConsultation,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    // 1. Resolve anchor date
    const anchor = await this.resolveAnchor(pc);
    if (anchor === null) {
      // paymentId set but session 1 not completed — skip
      return 'skipped';
    }

    // 2. Check final-warning override first (highest priority)
    if (this.shouldSendFinalWarning(pc, now)) {
      return this.sendReminder(pc, now, FINAL_STAGE);
    }

    // 3. Stage 0 (first reminder)
    if (pc.reminderStage === 0) {
      const triggerDate = new Date(anchor.getTime() + STAGE_0_DAYS * 24 * 60 * 60 * 1000);
      if (now >= triggerDate) {
        return this.sendReminder(pc, now, 1);
      }
      return 'skipped';
    }

    // 4. Stage >= 1 (weekly follow-up)
    if (pc.lastReminderAt !== null) {
      const nextTrigger = new Date(pc.lastReminderAt.getTime() + WEEKLY_DAYS * 24 * 60 * 60 * 1000);
      if (now >= nextTrigger) {
        return this.sendReminder(pc, now, pc.reminderStage + 1);
      }
    }

    return 'skipped';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the anchor Date (time to start counting from for reminders).
   * Returns null when paymentId is set but session 1 is not yet completed
   * (meaning the patient has not attended their first session).
   */
  private async resolveAnchor(pc: PendingConsultation): Promise<Date | null> {
    if (!pc.paymentId) {
      // No linked payment — count from when the pending row was created.
      return pc.createdAt;
    }

    // Find the completed appointment for session 1 (same payment_id).
    const session1 = await this.appointmentRepo.findFirstCompletedByPaymentId(pc.paymentId);
    if (!session1) {
      // Payment exists but session 1 not yet completed — not time to remind yet.
      return null;
    }

    return session1.updatedAt;
  }

  private shouldSendFinalWarning(pc: PendingConsultation, now: Date): boolean {
    if (pc.reminderStage >= FINAL_STAGE) return false;
    if (!pc.expiresAt) return false;
    const threshold = new Date(pc.expiresAt.getTime() - FINAL_WARN_DAYS * 24 * 60 * 60 * 1000);
    return now >= threshold;
  }

  private async sendReminder(
    pc: PendingConsultation,
    now: Date,
    newStage: number,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    // Resolve patient email (decrypted in the repo layer)
    const patient = await this.patientRepo.findById(pc.patientId, pc.doctorId);
    if (!patient?.email) {
      // No email address — skip silently (no PII logged)
      return 'skipped';
    }

    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(pc.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Su especialista';
    const scheduleUrl = this.buildScheduleUrl(pc.id);
    // Self-contained phrase: the template uses {{expiresAtLabel}} directly without
    // any conditional block. Empty string renders as a blank <p> (harmless).
    const expiresAtLabel = pc.expiresAt
      ? `Válido hasta el ${this.formatCaracas(pc.expiresAt)}`
      : '';

    try {
      await this.mailer.sendTemplate(
        'pending_consultation_reminder',
        patient.email,
        {
          patientName: patient.fullName ?? 'Paciente',
          doctorName,
          planName: pc.planName,
          sessionNumber: String(pc.sessionNumber),
          expiresAtLabel,
          scheduleUrl,
        },
        { type: 'patient', id: pc.patientId },
      );

      await this.pendingRepo.updateReminderStage(pc.id, newStage, now);
      return 'sent';
    } catch (err: unknown) {
      this.logger.warn(
        `[pending-reminders] mailer error for pending=${pc.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 'failed';
    }
  }

  private buildScheduleUrl(pendingId: string): string {
    const baseUrl = (this.config.get<string>('APP_BASE_URL') ?? '').replace(/\/+$/, '');
    const token = this.tokenService.sign(pendingId);
    return `${baseUrl}/agendar/${token}`;
  }

  private formatCaracas(date: Date): string {
    return date.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
