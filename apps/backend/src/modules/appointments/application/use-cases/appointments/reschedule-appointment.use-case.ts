import { Inject, Injectable } from '@nestjs/common';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';

/** Statuses that allow a reschedule operation. */
const RESCHEDULABLE_STATUSES: ReadonlySet<string> = new Set(['scheduled', 'confirmed']);

export interface RescheduleAppointmentInput {
  /** Appointment UUID from the path param. */
  appointmentId: string;
  /** Authenticated doctor's userId (from DevAuthGuard). */
  actorId: string;
  /** New datetime for the appointment (already parsed to Date). */
  newScheduledAt: Date;
}

/**
 * RescheduleAppointmentUseCase
 *
 * Validates ownership, reschedulable status, and slot availability, then
 * updates the scheduled_at of the appointment and records the change in the
 * audit log.
 *
 * No migration required: appointment_changes_log already supports any action string.
 */
@Injectable()
export class RescheduleAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: RescheduleAppointmentInput): Promise<Appointment> {
    // 1. Fetch existing appointment
    const appointment = await this.appointmentRepo.findById(input.appointmentId);
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    // 2. Verify ownership (anti-IDOR)
    if (!appointment.canBeModifiedBy(input.actorId)) {
      throw new UnauthorizedError();
    }

    // 3. Verify the appointment is in a reschedulable state
    if (!RESCHEDULABLE_STATUSES.has(appointment.status)) {
      throw new AppointmentNotReschedulableError(appointment.status);
    }

    // 4. Check slot conflict for the new datetime (exclude the appointment itself)
    const hasConflict = await this.appointmentRepo.hasSlotConflict({
      doctorId: appointment.doctorId,
      scheduledAt: input.newScheduledAt,
      excludeId: input.appointmentId,
    });
    if (hasConflict) {
      throw new AppointmentConflictError(input.newScheduledAt);
    }

    // 5. Persist the new scheduled_at
    const updated = await this.appointmentRepo.updateScheduledAt(
      input.appointmentId,
      input.newScheduledAt,
    );

    // 6. Audit log — action recorded as a pseudo-status transition from old datetime to new
    await this.appointmentRepo.logStatusChange({
      appointmentId: input.appointmentId,
      actorId: input.actorId,
      oldStatus: appointment.status,
      newStatus: appointment.status, // status does not change; log preserves rescheduled context
    });

    return updated;
  }
}
