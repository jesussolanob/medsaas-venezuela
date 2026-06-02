import { Inject, Injectable } from '@nestjs/common';
import type { AppointmentStatus } from '@delta/shared-types';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
  type AppointmentListResult,
} from '../../../domain/repositories/appointment.repository';

export interface GetDoctorAgendaInput {
  doctorId: string;
  dateFrom?: string;
  dateTo?: string;
  status?: AppointmentStatus;
  page: number;
  limit: number;
}

/**
 * Returns a paginated list of appointments for the requesting doctor.
 *
 * PII masking of patient data (patientName, patientPhone, patientEmail,
 * patientCedula) is applied by the presentation-layer mapper
 * (presentation/mappers/appointment.mapper.ts) — NOT here.
 */
@Injectable()
export class GetDoctorAgendaUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(input: GetDoctorAgendaInput): Promise<AppointmentListResult> {
    return this.appointmentRepo.list({
      doctorId: input.doctorId,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
      status: input.status,
      page: input.page,
      limit: input.limit,
    });
  }
}
