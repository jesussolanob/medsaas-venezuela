import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Optional,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CronSecretGuard } from '../../../../infrastructure/guards/cron-secret.guard';
import { DispatchDueRemindersUseCase } from '../../application/use-cases/reminders/dispatch-due-reminders.use-case';
import type { DispatchDueRemindersResult } from '../../application/use-cases/reminders/dispatch-due-reminders.use-case';
import { DispatchDoctorInactivityNoticesUseCase } from '../../application/use-cases/reminders/dispatch-doctor-inactivity-notices.use-case';
import type { DispatchDoctorInactivityNoticesResult } from '../../application/use-cases/reminders/dispatch-doctor-inactivity-notices.use-case';
import { DispatchPendingConsultationRemindersUseCase } from '../../../pending-consultations/application/use-cases/dispatch-pending-consultation-reminders.use-case';
import type { DispatchPendingRemindersResult } from '../../../pending-consultations/application/use-cases/dispatch-pending-consultation-reminders.use-case';
import { ExpireDuePendingConsultationsUseCase } from '../../../pending-consultations/application/use-cases/expire-due-pending-consultations.use-case';

interface CronRunResult extends DispatchDueRemindersResult {
  /** Pending consultation reminder emails sent in this run. */
  pendingRemindersSent: number;
  /** Pending consultations skipped (no email, or session 1 not yet completed). */
  pendingRemindersSkipped: number;
  /** Pending consultation reminder emails that failed in this run. */
  pendingRemindersFailed: number;
  /** Pending consultations expired (past their expires_at). */
  pendingExpired: number;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * CronRemindersController
 *
 * Exposes POST /api/cron/appointment-reminders — invoked by Cloud Scheduler
 * every 15 minutes.
 *
 * Security:
 *   - No AppAuthGuard — no user authentication (machine-to-machine).
 *   - CronSecretGuard enforces x-cron-secret === CRON_SECRET env var.
 *     If CRON_SECRET is not configured the guard rejects all requests (fail-closed).
 *   - Never exposes patient PII in the response; only aggregate counts.
 *
 * Pending consultation sub-tasks run after appointment reminders.
 * They are wrapped in individual try/catch so that a failure in either
 * pending sub-task does NOT abort the appointment-reminder flow.
 * Both sub-tasks are @Optional() so the controller remains testable and
 * backwards-compatible if PendingConsultationsModule is not imported.
 *
 * POST /api/cron/doctor-inactivity is a SEPARATE endpoint (not folded into
 * `run()` above) because it runs once a day, while appointment-reminders
 * runs every 15 minutes — different Cloud Scheduler jobs.
 */
@Controller('cron')
export class CronRemindersController {
  private readonly logger = new Logger(CronRemindersController.name);

  constructor(
    private readonly dispatchDueReminders: DispatchDueRemindersUseCase,
    private readonly dispatchDoctorInactivityNotices: DispatchDoctorInactivityNoticesUseCase,
    @Optional()
    @Inject(DispatchPendingConsultationRemindersUseCase)
    private readonly dispatchPendingReminders: DispatchPendingConsultationRemindersUseCase | null,
    @Optional()
    @Inject(ExpireDuePendingConsultationsUseCase)
    private readonly expirePending: ExpireDuePendingConsultationsUseCase | null,
  ) {}

  @Post('appointment-reminders')
  @UseGuards(CronSecretGuard)
  @HttpCode(HttpStatus.OK)
  async run(): Promise<SuccessResponse<CronRunResult>> {
    // 1. Appointment reminders (existing — must not fail)
    const apptResult = await this.dispatchDueReminders.execute();

    // 2. Pending consultation reminders (best-effort)
    let pendingRemindersResult: DispatchPendingRemindersResult = { sent: 0, skipped: 0, failed: 0 };
    if (this.dispatchPendingReminders) {
      try {
        pendingRemindersResult = await this.dispatchPendingReminders.execute();
      } catch (err: unknown) {
        this.logger.warn(
          '[cron] dispatchPendingReminders failed — appointment reminders unaffected: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // 3. Expiry sweep for pending consultations (best-effort)
    let pendingExpired = 0;
    if (this.expirePending) {
      try {
        pendingExpired = await this.expirePending.execute();
      } catch (err: unknown) {
        this.logger.warn(
          '[cron] expirePending failed — appointment reminders unaffected: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return {
      success: true,
      data: {
        ...apptResult,
        pendingRemindersSent: pendingRemindersResult.sent,
        pendingRemindersSkipped: pendingRemindersResult.skipped,
        pendingRemindersFailed: pendingRemindersResult.failed,
        pendingExpired,
      },
    };
  }

  /**
   * POST /api/cron/doctor-inactivity — invoked once a day by Cloud Scheduler.
   *
   * Dispatches "we miss you" notices to doctors inactive for 10+ / 15+ days.
   * The response only ever exposes aggregate counts — never doctor PII.
   */
  @Post('doctor-inactivity')
  @UseGuards(CronSecretGuard)
  @HttpCode(HttpStatus.OK)
  async runDoctorInactivity(): Promise<SuccessResponse<DispatchDoctorInactivityNoticesResult>> {
    const data = await this.dispatchDoctorInactivityNotices.execute();
    return { success: true, data };
  }
}
