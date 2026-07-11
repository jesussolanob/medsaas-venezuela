import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { UpdateAppointmentStatusDto } from '@delta/shared-types';
import type { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentInvalidTransitionError } from '../../../domain/errors/appointment-invalid-transition.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import { CancelCalendarEventUseCase } from '../../../../integrations/application/use-cases/integrations/cancel-calendar-event.use-case';
import { CreateConsultationUseCase } from '../../../../consultations/application/use-cases/consultations/create-consultation.use-case';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';

@Injectable()
export class UpdateAppointmentStatusUseCase {
  private readonly logger = new Logger(UpdateAppointmentStatusUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    /**
     * CancelCalendarEventUseCase — optional for backward compatibility with
     * existing tests that do not inject it. When present, cancels the Google
     * Calendar event (best-effort) when the appointment is cancelled.
     *
     * @Inject is mandatory: TypeScript emits `Object` for union types (`T | null`)
     * in reflect-metadata, so NestJS cannot resolve the class token without it.
     */
    @Optional()
    @Inject(CancelCalendarEventUseCase)
    private readonly cancelCalendarEvent: CancelCalendarEventUseCase | null = null,
    /**
     * CreateConsultationUseCase — optional for backward compatibility.
     * When present, a consultation is auto-created (idempotent) when the
     * appointment transitions to `confirmed`.
     *
     * @Inject is mandatory: same reflect-metadata union type issue as above.
     */
    @Optional()
    @Inject(CreateConsultationUseCase)
    private readonly createConsultationUC: CreateConsultationUseCase | null = null,
    /**
     * IConsultationRepository — optional for backward compatibility.
     * Used to check for an existing consultation before creating a new one
     * (idempotency guard).
     */
    @Optional()
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository | null = null,
  ) {}

  async execute(dto: UpdateAppointmentStatusDto): Promise<Appointment> {
    // 1. Fetch existing appointment
    const appointment = await this.appointmentRepo.findById(dto.id);
    if (!appointment) {
      throw new AppointmentNotFoundError(dto.id);
    }

    // 2. Verify ownership (anti-IDOR)
    if (!appointment.canBeModifiedBy(dto.actor_id)) {
      throw new AppointmentNotFoundError(dto.id);
    }

    // 3. Guard transition rules
    if (!appointment.canTransitionTo(dto.status)) {
      throw new AppointmentInvalidTransitionError(appointment.status, dto.status);
    }

    // 4. Persist new status
    const updated = await this.appointmentRepo.updateStatus(dto.id, dto.status);

    // 5. Record change in audit log
    await this.appointmentRepo.logStatusChange({
      appointmentId: dto.id,
      actorId: dto.actor_id,
      oldStatus: appointment.status,
      newStatus: dto.status,
    });

    // 6. Cancel Google Calendar event (best-effort — must not break appointment cancellation)
    if (
      dto.status === 'cancelled' &&
      appointment.googleCalendarEventId &&
      this.cancelCalendarEvent
    ) {
      try {
        await this.cancelCalendarEvent.execute(
          appointment.doctorId,
          appointment.googleCalendarEventId,
        );
      } catch (err) {
        this.logger.warn(
          `[cancel-event] Google Calendar event cancellation failed for appointment ${dto.id} (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 7. Auto-create consultation when transitioning to confirmed (idempotent).
    //    Only when the appointment has a known patient and the use-case is injected.
    //    Skip entirely when consultationId is already set — the consultation was
    //    auto-created at booking/appointment-create time (no duplicate needed).
    if (
      dto.status === 'confirmed' &&
      appointment.patientId &&
      this.createConsultationUC &&
      !appointment.consultationId
    ) {
      return this.maybeCreateConsultation(appointment, dto.actor_id, updated);
    }

    return updated;
  }

  /**
   * Creates a consultation linked to a confirmed appointment (idempotent).
   *
   * Idempotency: checks if a consultation already exists for this appointment
   * before creating a new one. If it does, updates the appointment's
   * consultation_id FK so the link is always in sync.
   *
   * Non-fatal: on failure the status-updated appointment is returned without
   * a linked consultation.
   */
  private async maybeCreateConsultation(
    appointment: Appointment,
    actorId: string,
    updated: Appointment,
  ): Promise<Appointment> {
    if (!this.createConsultationUC || !appointment.patientId) {
      return updated;
    }

    try {
      // Idempotency guard: if a consultation already exists for this appointment, reuse it.
      const existing = this.consultationRepo
        ? await this.consultationRepo.findByAppointmentId(appointment.id, appointment.doctorId)
        : null;

      const consultationId = existing
        ? existing.id
        : (
            await this.createConsultationUC.execute({
              doctorId: appointment.doctorId,
              patientId: appointment.patientId,
              appointmentId: appointment.id,
              consultationDate: appointment.scheduledAt,
              chiefComplaint: appointment.chiefComplaint ?? null,
            })
          ).id;

      // Link the consultation to the appointment if not already linked.
      if (!updated.consultationId || updated.consultationId !== consultationId) {
        return await this.appointmentRepo.updateConsultationId(appointment.id, consultationId);
      }

      return updated;
    } catch (err: unknown) {
      // Non-fatal: the status transition succeeded. Consultation can be linked later.
      this.logger.warn(
        `[confirm-consultation] Could not auto-create consultation for appointment ` +
          `${appointment.id} (actor: ${actorId}): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return updated;
    }
  }
}
