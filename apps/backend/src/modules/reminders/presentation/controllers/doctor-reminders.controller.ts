import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  UpsertRemindersSettingsDtoSchema,
  type UpsertRemindersSettingsDto,
} from '@delta/shared-types';
import { GetRemindersSettingsUseCase } from '../../application/use-cases/reminders/get-reminders-settings.use-case';
import { UpsertRemindersSettingsUseCase } from '../../application/use-cases/reminders/upsert-reminders-settings.use-case';
import { GetDoctorRemindersQueueUseCase } from '../../application/use-cases/reminders/get-doctor-reminders-queue.use-case';
import type { ReminderSettings } from '../../domain/entities/reminders-settings.entity';
import type { ReminderQueueItem } from '../../domain/entities/reminder-queue-item.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * DoctorRemindersController
 *
 * Doctor-scoped reminder configuration and queue monitoring.
 * Routes: /api/doctor/reminders/*
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub).
 *   - Never trust doctor_id from the request body — anti-IDOR.
 *   - All endpoints require DevAuthGuard (Etapa 1 only).
 */
@Controller('doctor/reminders')
@UseGuards(DevAuthGuard)
export class DoctorRemindersController {
  constructor(
    private readonly getSettingsUseCase: GetRemindersSettingsUseCase,
    private readonly upsertSettingsUseCase: UpsertRemindersSettingsUseCase,
    private readonly getDoctorQueueUseCase: GetDoctorRemindersQueueUseCase,
  ) {}

  /**
   * GET /api/doctor/reminders/settings
   * Returns the doctor's reminder settings.
   * When no row exists yet, returns the defaults (never 404).
   */
  @Get('settings')
  async getRemindersSettings(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReminderSettings>> {
    const settings = await this.getSettingsUseCase.execute(user.sub);
    return { success: true, data: settings };
  }

  /**
   * PUT /api/doctor/reminders/settings
   * Upserts the doctor's reminder settings. All fields are optional.
   */
  @Put('settings')
  @HttpCode(HttpStatus.OK)
  async upsertRemindersSettings(
    @Body(new ZodValidationPipe(UpsertRemindersSettingsDtoSchema)) dto: UpsertRemindersSettingsDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReminderSettings>> {
    const settings = await this.upsertSettingsUseCase.execute(user.sub, dto);
    return { success: true, data: settings };
  }

  /**
   * GET /api/doctor/reminders/queue
   * Returns the doctor's reminder queue ordered by scheduled_for ASC.
   * Returns [] when no items exist (normal in Etapa 1).
   */
  @Get('queue')
  async getDoctorRemindersQueue(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReminderQueueItem[]>> {
    const items = await this.getDoctorQueueUseCase.execute(user.sub);
    return { success: true, data: items };
  }
}
