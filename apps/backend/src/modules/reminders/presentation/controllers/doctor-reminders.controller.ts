import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  UpsertRemindersSettingsDtoSchema,
  type UpsertRemindersSettingsDto,
  SendAppointmentReminderDtoSchema,
  type SendAppointmentReminderDto,
} from '@delta/shared-types';
import { GetRemindersSettingsUseCase } from '../../application/use-cases/reminders/get-reminders-settings.use-case';
import { UpsertRemindersSettingsUseCase } from '../../application/use-cases/reminders/upsert-reminders-settings.use-case';
import { GetDoctorRemindersQueueUseCase } from '../../application/use-cases/reminders/get-doctor-reminders-queue.use-case';
import { SendAppointmentReminderEmailUseCase } from '../../application/use-cases/reminders/send-appointment-reminder-email.use-case';
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
 *   - All endpoints require AppAuthGuard.
 */
@Controller('doctor/reminders')
@UseGuards(AppAuthGuard)
export class DoctorRemindersController {
  constructor(
    private readonly getSettingsUseCase: GetRemindersSettingsUseCase,
    private readonly upsertSettingsUseCase: UpsertRemindersSettingsUseCase,
    private readonly getDoctorQueueUseCase: GetDoctorRemindersQueueUseCase,
    private readonly sendReminderEmailUseCase: SendAppointmentReminderEmailUseCase,
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

  /**
   * POST /api/doctor/reminders/send-email
   *
   * Sends a branded reminder email to the patient of a given appointment.
   * The doctor must supply either appointment_id or consultation_id (or both;
   * appointment_id takes precedence).
   *
   * SECURITY:
   *   - The appointment is always fetched scoped to the authenticated doctor's ID
   *     (anti-IDOR: a foreign ID returns the same 404 as a missing one).
   *   - Never exposes whether the ID exists under a different doctor.
   *
   * ERRORS:
   *   - 404 AppointmentNotFoundForReminderError — appointment not found or belongs to another doctor.
   *   - 422 PatientEmailMissingError             — patient has no email on record.
   */
  @Post('send-email')
  @HttpCode(HttpStatus.OK)
  async sendReminderEmail(
    @Body(new ZodValidationPipe(SendAppointmentReminderDtoSchema)) dto: SendAppointmentReminderDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ sent: true }>> {
    const result = await this.sendReminderEmailUseCase.execute({
      doctorId: user.sub,
      appointmentId: dto.appointment_id,
      consultationId: dto.consultation_id,
    });
    return { success: true, data: result };
  }
}
