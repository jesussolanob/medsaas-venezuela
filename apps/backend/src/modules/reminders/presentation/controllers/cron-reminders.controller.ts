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
import { ApplyScheduledDeactivationsUseCase } from '../../../doctor-settings/application/use-cases/doctor-settings/apply-scheduled-deactivations.use-case';
import { ExpireDuePendingConsultationsUseCase } from '../../../pending-consultations/application/use-cases/expire-due-pending-consultations.use-case';
import { DispatchQuoteExpiryNoticesUseCase } from '../../../quotes/application/use-cases/dispatch-quote-expiry-notices.use-case';

interface CronRunResult extends DispatchDueRemindersResult {
  /** Pending consultation reminder emails sent in this run. */
  pendingRemindersSent: number;
  /** Pending consultations skipped (no email, or session 1 not yet completed). */
  pendingRemindersSkipped: number;
  /** Pending consultation reminder emails that failed in this run. */
  pendingRemindersFailed: number;
  /** Pending consultations expired (past their expires_at). */
  pendingExpired: number;
  /** Cuentas con baja programada que vencieron y pasaron a plan gratuito. */
  scheduledDeactivationsApplied: number;
  /** Presupuestos vencidos (status sent → expired) en esta corrida. */
  quotesExpired: number;
  /** Avisos de "presupuesto por vencer" enviados en esta corrida. */
  quoteExpiryRemindersSent: number;
  /** Avisos de "presupuesto por vencer" que fallaron en esta corrida. */
  quoteExpiryRemindersFailed: number;
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
 * Pending consultation sub-tasks (and the quote-expiry sub-task, step 5) run
 * after appointment reminders. Each is wrapped in its own try/catch so that a
 * failure in any of them does NOT abort the appointment-reminder flow.
 * Every sub-task is @Optional() so the controller remains testable and
 * backwards-compatible if its owning module is not imported.
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
    @Optional()
    @Inject(ApplyScheduledDeactivationsUseCase)
    private readonly applyScheduledDeactivations: ApplyScheduledDeactivationsUseCase | null,
    @Optional()
    @Inject(DispatchQuoteExpiryNoticesUseCase)
    private readonly dispatchQuoteExpiryNotices: DispatchQuoteExpiryNoticesUseCase | null,
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

    // 4. Bajas programadas que ya vencieron (best-effort): pasan a plan
    //    gratuito y se apagan. Va acá y no en un cron nuevo porque este ya
    //    corre una vez al día.
    let bajasAplicadas = 0;
    if (this.applyScheduledDeactivations) {
      try {
        bajasAplicadas = await this.applyScheduledDeactivations.execute();
      } catch (err: unknown) {
        this.logger.warn(
          '[cron] applyScheduledDeactivations failed — appointment reminders unaffected: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // 5. Quote expiry sweep + "about to expire" notice (best-effort). Va acá
    //    y no en un cron nuevo: no hay forma de dar de alta un Cloud Scheduler
    //    nuevo, y este endpoint ya corre cada 15 minutos sin haber sido nunca
    //    pausado (a diferencia de doctor-inactivity).
    let quotesExpired = 0;
    let quoteExpiryRemindersSent = 0;
    let quoteExpiryRemindersFailed = 0;
    if (this.dispatchQuoteExpiryNotices) {
      try {
        const result = await this.dispatchQuoteExpiryNotices.execute();
        quotesExpired = result.quotesExpired;
        quoteExpiryRemindersSent = result.quoteExpiryRemindersSent;
        quoteExpiryRemindersFailed = result.quoteExpiryRemindersFailed;
      } catch (err: unknown) {
        this.logger.warn(
          '[cron] dispatchQuoteExpiryNotices failed — appointment reminders unaffected: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return {
      success: true,
      data: {
        ...apptResult,
        scheduledDeactivationsApplied: bajasAplicadas,
        pendingRemindersSent: pendingRemindersResult.sent,
        pendingRemindersSkipped: pendingRemindersResult.skipped,
        pendingRemindersFailed: pendingRemindersResult.failed,
        pendingExpired,
        quotesExpired,
        quoteExpiryRemindersSent,
        quoteExpiryRemindersFailed,
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
