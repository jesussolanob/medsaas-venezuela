import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../../../../infrastructure/guards/cron-secret.guard';
import { DispatchDueRemindersUseCase } from '../../application/use-cases/reminders/dispatch-due-reminders.use-case';
import type { DispatchDueRemindersResult } from '../../application/use-cases/reminders/dispatch-due-reminders.use-case';

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
 */
@Controller('cron')
export class CronRemindersController {
  constructor(private readonly dispatchDueReminders: DispatchDueRemindersUseCase) {}

  @Post('appointment-reminders')
  @UseGuards(CronSecretGuard)
  @HttpCode(HttpStatus.OK)
  async run(): Promise<SuccessResponse<DispatchDueRemindersResult>> {
    const data = await this.dispatchDueReminders.execute();
    return { success: true, data };
  }
}
