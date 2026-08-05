import { Inject, Injectable } from '@nestjs/common';
import type { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';

export interface GetAppointmentByIdInput {
  appointmentId: string;
  doctorId: string;
}

@Injectable()
export class GetAppointmentByIdUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: GetAppointmentByIdInput): Promise<Appointment> {
    // findByIdScopedEnriched enforces ownership at the SQL level (WHERE doctor_id = :doctorId)
    // AND enriches the response with consultationCode, paymentStatus, and officeName via JOIN.
    // Returns null for non-existent appointments AND for appointments owned by another doctor —
    // anti-IDOR (same 404 response, no enumeration).
    const appointment = await this.appointmentRepo.findByIdScopedEnriched(
      input.appointmentId,
      input.doctorId,
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    return appointment;
  }
}
