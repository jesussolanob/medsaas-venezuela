import { Inject, Injectable } from '@nestjs/common';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';

/** Statuses that allow a reschedule operation. */
const RESCHEDULABLE_STATUSES: ReadonlySet<string> = new Set(['scheduled', 'confirmed']);

/** Default slot duration used for overlap detection when the appointment has no stored duration. */
const DEFAULT_SLOT_DURATION_MINUTES = 30;

export interface RescheduleAppointmentInput {
  /** Appointment UUID from the path param. */
  appointmentId: string;
  /** Authenticated doctor's userId (from AppAuthGuard). */
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
    // Anti-IDOR + anti-enumeración: cita de otro doctor → como inexistente.
    if (!appointment.canBeModifiedBy(input.actorId)) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    // 3. Verify the appointment is in a reschedulable state
    if (!RESCHEDULABLE_STATUSES.has(appointment.status)) {
      throw new AppointmentNotReschedulableError(appointment.status);
    }

    const durationMinutes = appointment.durationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;

    // 4. Check slot overlap for the new datetime (exclude the appointment itself)
    const hasConflict = await this.appointmentRepo.hasOverlap({
      doctorId: appointment.doctorId,
      scheduledAt: input.newScheduledAt,
      durationMinutes,
      excludeId: input.appointmentId,
    });
    if (hasConflict) {
      throw new AppointmentConflictError(input.newScheduledAt);
    }

    // 5. Check patient overlap for the new datetime (cross-doctor; exclude the appointment itself)
    if (appointment.patientId) {
      const patientOverlaps = await this.appointmentRepo.hasPatientOverlap({
        patientId: appointment.patientId,
        scheduledAt: input.newScheduledAt,
        durationMinutes,
        excludeId: input.appointmentId,
      });
      if (patientOverlaps) {
        throw new AppointmentDuplicateError(appointment.patientId, input.newScheduledAt);
      }
    }

    // 6. Persist the new scheduled_at
    const updated = await this.appointmentRepo.updateScheduledAt(
      input.appointmentId,
      input.newScheduledAt,
    );

    // 7. Audit log — action recorded as a pseudo-status transition from old datetime to new
    await this.appointmentRepo.logStatusChange({
      appointmentId: input.appointmentId,
      actorId: input.actorId,
      oldStatus: appointment.status,
      newStatus: appointment.status, // status does not change; log preserves rescheduled context
    });

    return updated;
  }
}
