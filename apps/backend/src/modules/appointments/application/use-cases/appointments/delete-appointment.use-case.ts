import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';

export interface DeleteAppointmentInput {
  appointmentId: string;
  /** Authenticated actor — used for IDOR check and audit log. */
  actorId: string;
}

/**
 * Deletes an appointment (hard-delete) and its linked consultation (if any).
 *
 * Order of operations:
 *  1. Fetch appointment scoped to actorId (anti-IDOR — returns 404 for foreign appointments).
 *  2. Delete linked consultation first (FK constraint: consultations.appointment_id).
 *  3. Append audit log entry with newStatus 'deleted'.
 *  4. Delete appointment row.
 *
 * No migration needed — this is a hard-delete against the existing schema.
 */
@Injectable()
export class DeleteAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    /**
     * IConsultationRepository — optional for backward compatibility with test
     * contexts that do not inject it. When present, the linked consultation is
     * also deleted before the appointment row is removed.
     */
    @Optional()
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository | null = null,
  ) {}

  async execute(input: DeleteAppointmentInput): Promise<void> {
    // 1. Ownership check (anti-IDOR): returns null for foreign or missing appointments.
    const appointment = await this.appointmentRepo.findByIdForDoctor(
      input.appointmentId,
      input.actorId,
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    // 2. Delete linked consultation first to satisfy FK constraints.
    if (appointment.consultationId && this.consultationRepo) {
      await this.consultationRepo.deleteById(appointment.consultationId);
    }

    // 3. Append audit log entry before deleting the row (preserves the appointmentId reference).
    await this.appointmentRepo.logStatusChange({
      appointmentId: input.appointmentId,
      actorId: input.actorId,
      oldStatus: appointment.status,
      newStatus: 'deleted',
    });

    // 4. Hard-delete the appointment row.
    await this.appointmentRepo.deleteById(input.appointmentId);
  }
}
