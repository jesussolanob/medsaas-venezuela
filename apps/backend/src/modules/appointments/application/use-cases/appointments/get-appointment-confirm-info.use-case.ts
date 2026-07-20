import { Inject, Injectable } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import { AppointmentConfirmTokenService } from '../../../infrastructure/services/appointment-confirm-token.service';
import { AppointmentConfirmInvalidTokenError } from '../../../domain/errors/appointment-confirm-invalid-token.error';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';

export interface AppointmentPublicInfo {
  status: string;
  doctorName: string;
  date: string;
  time: string;
  modality: string;
}

/**
 * GetAppointmentConfirmInfoUseCase
 *
 * Read-only use case — verifies a confirmation token and returns safe,
 * non-PII appointment info for rendering the public confirmation page.
 *
 * SECURITY:
 *   - Token is verified via HMAC before any DB access.
 *   - Returns only status, doctorName, date, time, modality —
 *     never patient PII (no cedula, phone, email).
 *   - Invalid/malformed tokens → 404 (anti-enumeration).
 */
@Injectable()
export class GetAppointmentConfirmInfoUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly tokenService: AppointmentConfirmTokenService,
  ) {}

  async execute(token: string): Promise<AppointmentPublicInfo> {
    const appointmentId = this.tokenService.verify(token);
    if (!appointmentId) {
      throw new AppointmentConfirmInvalidTokenError();
    }

    const appointment = await this.appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new AppointmentConfirmInvalidTokenError();
    }

    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(appointment.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Su médico';

    return {
      status: appointment.status,
      doctorName,
      date: appointment.scheduledAt.toLocaleDateString('es-VE', {
        timeZone: 'America/Caracas',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: appointment.scheduledAt.toLocaleTimeString('es-VE', {
        timeZone: 'America/Caracas',
        hour: '2-digit',
        minute: '2-digit',
      }),
      modality: appointment.appointmentMode,
    };
  }
}
