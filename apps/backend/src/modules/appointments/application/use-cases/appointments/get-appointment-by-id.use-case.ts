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
    const appointment = await this.appointmentRepo.findById(input.appointmentId);
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    // Anti-IDOR + anti-enumeración: una cita de otro doctor se trata como
    // inexistente (mismo error que not-found), para no revelar su existencia.
    if (!appointment.canBeModifiedBy(input.doctorId)) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    return appointment;
  }
}
