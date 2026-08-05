import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DOCTOR_INACTIVITY_REPOSITORY,
  type IDoctorInactivityRepository,
  type InactiveDoctorCandidate,
} from '../../../domain/repositories/doctor-inactivity.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';

/** Max doctors processed per cron invocation. */
const DISPATCH_CAP = 200;

/** Days of inactivity before the first ("we miss you") notice is sent. */
const INACTIVITY_THRESHOLD_10_DAYS = 10;

/** Days of inactivity before the second (final) notice is sent. */
const INACTIVITY_THRESHOLD_15_DAYS = 15;

/**
 * inactivity_notice_stage values — mirrors the migration column comment.
 * 0 (never notified) is the implicit default and never referenced directly
 * here — every check below is expressed as `stage < N`.
 */
const STAGE_10_DAY_SENT = 1;
const STAGE_15_DAY_SENT = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DispatchDoctorInactivityNoticesResult {
  sent10: number;
  sent15: number;
  skipped: number;
  failed: number;
}

type Outcome = 'sent10' | 'sent15' | 'skipped' | 'failed';

/**
 * DispatchDoctorInactivityNoticesUseCase
 *
 * Scheduled use case — triggered by POST /api/cron/doctor-inactivity.
 * Expected to run once a day via Cloud Scheduler.
 *
 * Two-stage escalation, gated on `inactivity_notice_stage` (idempotent —
 * a doctor never receives the same stage twice):
 *
 *   daysInactive >= 15 AND stage < 2 → send 'doctor_inactivity_15d', stage = 2
 *   daysInactive >= 10 AND stage < 1 → send 'doctor_inactivity_10d', stage = 1
 *   otherwise                        → skip
 *
 * The 15-day check runs first so a doctor who has been inactive long enough
 * to skip past 10 days entirely (e.g. the cron missed a run) receives only
 * the final notice, never both in the same pass.
 *
 * Candidates are queried directly via the partial index
 * idx_profiles_doctor_last_sign_in (role='doctor' AND is_active=true) —
 * never loads the full profiles table into memory.
 *
 * Each doctor is wrapped in try/catch so a single mailer failure does not
 * abort the rest of the batch. A cap of 200 per run prevents runaway work.
 *
 * SECURITY / PII:
 *   - Logger never emits doctor email, name, or phone — only doctorId (uuid).
 *   - The doctor's display name is used ONLY inside the rendered email body,
 *     never logged.
 */
@Injectable()
export class DispatchDoctorInactivityNoticesUseCase {
  private readonly logger = new Logger(DispatchDoctorInactivityNoticesUseCase.name);

  constructor(
    @Inject(DOCTOR_INACTIVITY_REPOSITORY)
    private readonly inactivityRepo: IDoctorInactivityRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(nowOverride?: Date): Promise<DispatchDoctorInactivityNoticesResult> {
    const now = nowOverride ?? new Date();
    const candidates = await this.inactivityRepo.findCandidates(DISPATCH_CAP);

    if (candidates.length === DISPATCH_CAP) {
      this.logger.warn(
        `[doctor-inactivity] cap reached (${DISPATCH_CAP} doctors). Some may be deferred to next run.`,
      );
    }

    let sent10 = 0;
    let sent15 = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const outcome = await this.processOne(candidate, now);
        if (outcome === 'sent10') sent10++;
        else if (outcome === 'sent15') sent15++;
        else if (outcome === 'skipped') skipped++;
        else failed++;
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[doctor-inactivity] unhandled error for doctor=${candidate.doctorId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.logger.log(
      `[doctor-inactivity] sent10=${sent10} sent15=${sent15} skipped=${skipped} failed=${failed}`,
    );
    return { sent10, sent15, skipped, failed };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async processOne(candidate: InactiveDoctorCandidate, now: Date): Promise<Outcome> {
    const daysInactive = this.calcDaysInactive(candidate.lastSignInAt, now);

    // 15-day check first — a doctor who skipped past 10 days without a run
    // gets only the final notice, never both stages in the same pass.
    if (
      daysInactive >= INACTIVITY_THRESHOLD_15_DAYS &&
      candidate.inactivityNoticeStage < STAGE_15_DAY_SENT
    ) {
      return this.sendNotice(candidate, now, 'doctor_inactivity_15d', STAGE_15_DAY_SENT, 'sent15');
    }

    if (
      daysInactive >= INACTIVITY_THRESHOLD_10_DAYS &&
      candidate.inactivityNoticeStage < STAGE_10_DAY_SENT
    ) {
      return this.sendNotice(candidate, now, 'doctor_inactivity_10d', STAGE_10_DAY_SENT, 'sent10');
    }

    return 'skipped';
  }

  private async sendNotice(
    candidate: InactiveDoctorCandidate,
    now: Date,
    templateName: string,
    newStage: typeof STAGE_10_DAY_SENT | typeof STAGE_15_DAY_SENT,
    outcome: 'sent10' | 'sent15',
  ): Promise<Outcome> {
    const doctorName = candidate.fullName ?? 'Especialista';

    try {
      await this.mailer.sendTemplate(
        templateName,
        candidate.email,
        {
          doctorName,
          appUrl: this.buildAppUrl(),
        },
        { type: 'doctor', id: candidate.doctorId },
      );

      await this.inactivityRepo.markNoticeSent(candidate.doctorId, newStage, now);
      return outcome;
    } catch (err: unknown) {
      this.logger.warn(
        `[doctor-inactivity] mailer error for doctor=${candidate.doctorId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 'failed';
    }
  }

  private calcDaysInactive(lastSignInAt: Date, now: Date): number {
    return Math.floor((now.getTime() - lastSignInAt.getTime()) / MS_PER_DAY);
  }

  private buildAppUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      ''
    ).replace(/\/+$/, '');
  }
}
