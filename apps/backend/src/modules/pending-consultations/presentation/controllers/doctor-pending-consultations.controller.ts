import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  SchedulePendingConsultationDtoSchema,
  type SchedulePendingConsultationDto,
  CreateDoctorPendingConsultationsDtoSchema,
  type CreateDoctorPendingConsultationsDto,
  type PendingConsultationStatus,
} from '@delta/shared-types';
import { GetDoctorPendingConsultationsUseCase } from '../../application/use-cases/get-doctor-pending-consultations.use-case';
import { SchedulePendingConsultationUseCase } from '../../application/use-cases/schedule-pending-consultation.use-case';
import { CancelPendingConsultationUseCase } from '../../application/use-cases/cancel-pending-consultation.use-case';
import { CreateDoctorPendingConsultationsUseCase } from '../../application/use-cases/create-doctor-pending-consultations.use-case';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

function toResponse(entity: PendingConsultation) {
  return {
    id: entity.id,
    doctor_id: entity.doctorId,
    patient_id: entity.patientId,
    package_id: entity.packageId,
    plan_name: entity.planName,
    office_id: entity.officeId,
    appointment_mode: entity.appointmentMode,
    session_number: entity.sessionNumber,
    status: entity.status,
    expires_at: entity.expiresAt?.toISOString() ?? null,
    scheduled_appointment_id: entity.scheduledAppointmentId,
    consultation_id: entity.consultationId,
    reminder_stage: entity.reminderStage,
    created_at: entity.createdAt.toISOString(),
    updated_at: entity.updatedAt.toISOString(),
  };
}

/**
 * DoctorPendingConsultationsController
 *
 * Doctor-only endpoints for managing "consultas por agendar" (pending consultations).
 *
 * All endpoints require AppAuthGuard. doctor_id is always taken from user.sub (anti-IDOR).
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 */
@Controller('doctor/pending-consultations')
@UseGuards(AppAuthGuard)
export class DoctorPendingConsultationsController {
  constructor(
    private readonly getList: GetDoctorPendingConsultationsUseCase,
    private readonly schedule: SchedulePendingConsultationUseCase,
    private readonly cancel: CancelPendingConsultationUseCase,
    private readonly createDoctorPending: CreateDoctorPendingConsultationsUseCase,
  ) {}

  /**
   * GET /api/doctor/pending-consultations
   * List pending consultations for the authenticated doctor.
   * Optional: ?status=pending_scheduling|scheduled|completed|expired|cancelled
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: PendingConsultationStatus,
  ): Promise<SuccessResponse<ReturnType<typeof toResponse>[]>> {
    const items = await this.getList.execute({
      doctorId: user.sub,
      status,
    });
    return { success: true, data: items.map(toResponse) };
  }

  /**
   * POST /api/doctor/pending-consultations
   * Bulk-create pending consultations for deferred sessions in a multi-session plan.
   *
   * Doctor-initiated path (specialist flow): the doctor creates the first session via
   * POST /api/appointments, then calls this endpoint for the unscheduled remainder.
   * Anti-IDOR: patient_id and plan_id are validated against doctorId = user.sub.
   * expiresAt is resolved authoritatively from pricing_plan.validity_days.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @Body(new ZodValidationPipe(CreateDoctorPendingConsultationsDtoSchema))
    dto: CreateDoctorPendingConsultationsDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReturnType<typeof toResponse>[]>> {
    const items = await this.createDoctorPending.execute({
      doctorId: user.sub,
      patientId: dto.patient_id,
      planId: dto.plan_id,
      sessionNumbers: dto.session_numbers,
      paymentId: dto.payment_id ?? null,
      officeId: dto.office_id ?? null,
      appointmentMode: dto.appointment_mode ?? null,
    });
    return { success: true, data: items.map(toResponse) };
  }

  /**
   * POST /api/doctor/pending-consultations/:id/schedule
   * Schedule a pending consultation — creates an appointment + optional consultation.
   */
  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  async scheduleOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SchedulePendingConsultationDtoSchema))
    dto: SchedulePendingConsultationDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReturnType<typeof toResponse>>> {
    const result = await this.schedule.execute({
      id,
      doctorId: user.sub,
      scheduledAt: new Date(dto.scheduled_at),
      officeId: dto.office_id ?? null,
      appointmentMode: dto.appointment_mode ?? null,
    });
    return { success: true, data: toResponse(result) };
  }

  /**
   * PUT /api/doctor/pending-consultations/:id/cancel
   * Cancel a pending consultation (only pending_scheduling allowed).
   */
  @Put(':id/cancel')
  async cancelOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ReturnType<typeof toResponse>>> {
    const result = await this.cancel.execute({ id, doctorId: user.sub });
    return { success: true, data: toResponse(result) };
  }
}
