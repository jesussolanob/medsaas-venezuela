import { Controller, Get, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  GetAdminRemindersQueueUseCase,
  type AdminQueueRow,
} from '../../application/use-cases/reminders/get-admin-reminders-queue.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * AdminRemindersController
 *
 * Admin-only reminder queue monitor.
 * Routes: /api/admin/reminders/*
 *
 * SECURITY:
 *   - Requires DevAuthGuard + RolesGuard + @Roles('super_admin').
 *   - Returns doctor names (from profiles.full_name), not patient PII.
 */
@Controller('admin/reminders')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminRemindersController {
  constructor(private readonly getAdminQueueUseCase: GetAdminRemindersQueueUseCase) {}

  /**
   * GET /api/admin/reminders/queue
   * Returns up to 50 queue items enriched with doctorName, ordered by scheduled_for ASC.
   */
  @Get('queue')
  async getAdminQueue(): Promise<SuccessResponse<AdminQueueRow[]>> {
    const rows = await this.getAdminQueueUseCase.execute();
    return { success: true, data: rows };
  }
}
