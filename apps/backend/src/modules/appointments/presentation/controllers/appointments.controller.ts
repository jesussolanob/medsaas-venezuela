import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateAppointmentDtoSchema,
  UpdateAppointmentStatusDtoSchema,
  RescheduleAppointmentDtoSchema,
  type CreateAppointmentDto,
  type UpdateAppointmentStatusDto,
  type RescheduleAppointmentDto,
  type AppointmentStatus,
} from '@delta/shared-types';
import { CreateAppointmentUseCase } from '../../application/use-cases/appointments/create-appointment.use-case';
import { UpdateAppointmentStatusUseCase } from '../../application/use-cases/appointments/update-appointment-status.use-case';
import { GetDoctorAgendaUseCase } from '../../application/use-cases/appointments/get-doctor-agenda.use-case';
import { GetAppointmentByIdUseCase } from '../../application/use-cases/appointments/get-appointment-by-id.use-case';
import { RescheduleAppointmentUseCase } from '../../application/use-cases/appointments/reschedule-appointment.use-case';
import { maskAppointmentPii } from '../mappers/appointment.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; page: number; limit: number };
}

/**
 * Appointments controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 */
@Controller('appointments')
@UseGuards(AppAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly createAppointment: CreateAppointmentUseCase,
    private readonly updateStatus: UpdateAppointmentStatusUseCase,
    private readonly getDoctorAgenda: GetDoctorAgendaUseCase,
    private readonly getById: GetAppointmentByIdUseCase,
    private readonly reschedule: RescheduleAppointmentUseCase,
  ) {}

  /** GET /api/appointments — paginated list with PII masking applied by the mapper. */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.getDoctorAgenda.execute({
      doctorId: user.sub,
      dateFrom,
      dateTo,
      status,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    // PII masking is applied here at the presentation boundary — never in the repo or use case.
    const masked = result.items.map(maskAppointmentPii);

    return {
      success: true,
      data: masked,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** GET /api/appointments/:id — single appointment detail (full PII, ownership enforced). */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const appointment = await this.getById.execute({
      appointmentId: id,
      doctorId: user.sub,
    });
    return { success: true, data: appointment };
  }

  /**
   * POST /api/appointments — create a new appointment.
   *
   * doctor_id from the body is overridden with the authenticated actor's id to
   * prevent IDOR: a doctor must not be able to create appointments on behalf of
   * another doctor by supplying a different doctor_id in the payload.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateAppointmentDtoSchema)) dto: CreateAppointmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const appointment = await this.createAppointment.execute({
      ...dto,
      doctor_id: user.sub,
    });
    return { success: true, data: appointment };
  }

  /**
   * PUT /api/appointments/:id/reschedule — reschedule an existing appointment.
   *
   * Validates: ownership, reschedulable status (scheduled|confirmed), and slot availability.
   * Records the change in appointment_changes_log.
   * Body: { scheduled_at: ISO8601 datetime string }
   */
  @Put(':id/reschedule')
  async rescheduleAppointment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RescheduleAppointmentDtoSchema)) dto: RescheduleAppointmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const updated = await this.reschedule.execute({
      appointmentId: id,
      actorId: user.sub,
      newScheduledAt: new Date(dto.scheduled_at),
    });
    return { success: true, data: updated };
  }

  /** PUT /api/appointments/:id/status — update appointment status. */
  @Put(':id/status')
  async updateAppointmentStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAppointmentStatusDtoSchema))
    dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    // id from path and actor_id from the authenticated user both override the body values.
    const updatedDto: UpdateAppointmentStatusDto = {
      ...dto,
      id,
      actor_id: user.sub,
    };
    const appointment = await this.updateStatus.execute(updatedDto);
    return { success: true, data: appointment };
  }
}
