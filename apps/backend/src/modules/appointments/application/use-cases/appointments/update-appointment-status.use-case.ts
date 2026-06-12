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
     * No circular dependency risk: IntegrationsModule does NOT import AppointmentsModule.
     * AppointmentsModule imports IntegrationsModule to access this use case.
     */
    @Optional()
    private readonly cancelCalendarEvent: CancelCalendarEventUseCase | null = null,
  ) {}

  async execute(dto: UpdateAppointmentStatusDto): Promise<Appointment> {
    // 1. Fetch existing appointment
    const appointment = await this.appointmentRepo.findById(dto.id);
    if (!appointment) {
      throw new AppointmentNotFoundError(dto.id);
    }

    // 2. Verify ownership (anti-IDOR)
    // Anti-IDOR + anti-enumeración: cita de otro doctor → como inexistente.
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
        // Non-fatal: Google Calendar cancellation failure does not roll back the appointment
        this.logger.warn(
          `[cancel-event] Google Calendar event cancellation failed for appointment ${dto.id} (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return updated;
  }
}
