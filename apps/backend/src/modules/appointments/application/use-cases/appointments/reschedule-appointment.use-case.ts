import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import { UpdateCalendarEventUseCase } from '../../../../integrations/application/use-cases/integrations/update-calendar-event.use-case';
import { computeActiveStatus } from '../../../domain/policies/appointment-status.policy';

/** Milliseconds in one minute — used to compute the new event end time. */
const MS_PER_MINUTE = 60_000;

/**
 * Statuses that allow a reschedule operation.
 *
 * 'no_show' is intentionally included: when the patient missed the appointment
 * the doctor can reschedule it instead of leaving it unresolved.  The appointment
 * is restored to an active status ('confirmed' or 'scheduled') so it re-enters
 * the normal workflow.  'cancelled' and 'completed' remain blocked.
 */
const RESCHEDULABLE_STATUSES: ReadonlySet<string> = new Set(['scheduled', 'confirmed', 'no_show']);

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
  private readonly logger = new Logger(RescheduleAppointmentUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    /**
     * UpdateCalendarEventUseCase — optional for backward compatibility with
     * existing tests that do not inject it. When present, moves the Google
     * Calendar event (best-effort) to the new time after a reschedule.
     *
     * @Inject is mandatory: TypeScript emits `Object` for union types (`T | null`)
     * in reflect-metadata, so NestJS cannot resolve the class token without it.
     */
    @Optional()
    @Inject(UpdateCalendarEventUseCase)
    private readonly updateCalendarEvent: UpdateCalendarEventUseCase | null = null,
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
    const dateUpdated = await this.appointmentRepo.updateScheduledAt(
      input.appointmentId,
      input.newScheduledAt,
    );

    // 6b. When rescheduling out of 'no_show', restore the appointment to an
    //     active status using the same 3-day auto-confirm rule as appointment
    //     creation ('confirmed' when < 3 days away, 'scheduled' otherwise).
    //     Non-no_show reschedules preserve the current status unchanged.
    const previousStatus = appointment.status;
    let updated = dateUpdated;
    if (previousStatus === 'no_show') {
      const restoredStatus = computeActiveStatus(input.newScheduledAt);
      updated = await this.appointmentRepo.updateStatus(input.appointmentId, restoredStatus);
    }

    // 7. Audit log — when rescheduling from 'no_show' record the real status
    //    transition (no_show → confirmed/scheduled) so there is a permanent
    //    trace of the patient having missed the original appointment.
    //    For date-only reschedules the status does not change.
    await this.appointmentRepo.logStatusChange({
      appointmentId: input.appointmentId,
      actorId: input.actorId,
      oldStatus: previousStatus,
      newStatus: updated.status,
    });

    // 8. Move the Google Calendar event to the new time (best-effort — must not
    //    break the reschedule). Only when the appointment has a synced event and
    //    the use-case is injected. sendUpdates:'all' inside the service notifies
    //    the patient so their calendar reflects the new time.
    if (appointment.googleCalendarEventId && this.updateCalendarEvent) {
      const startISO = input.newScheduledAt.toISOString();
      const endISO = new Date(
        input.newScheduledAt.getTime() + durationMinutes * MS_PER_MINUTE,
      ).toISOString();
      try {
        await this.updateCalendarEvent.execute(
          appointment.doctorId,
          appointment.googleCalendarEventId,
          startISO,
          endISO,
        );
      } catch (err) {
        this.logger.warn(
          `[reschedule-event] Google Calendar event update failed for appointment ${input.appointmentId} (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return updated;
  }
}
