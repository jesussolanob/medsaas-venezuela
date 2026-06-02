import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_DOCTOR_LOADER,
  type IBookingDoctorLoader,
  type DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';
import { DoctorNotFoundError } from './create-booking.use-case';

/**
 * Returns public doctor profile info for the booking form.
 * Throws DoctorNotFoundError (→ 404 via GlobalExceptionFilter) when the doctor
 * does not exist or is inactive — prevents oracle-style enumeration.
 */
@Injectable()
export class GetBookingDoctorInfoUseCase {
  constructor(
    @Inject(BOOKING_DOCTOR_LOADER)
    private readonly doctorLoader: IBookingDoctorLoader,
  ) {}

  async execute(doctorId: string): Promise<DoctorPublicInfo> {
    const info = await this.doctorLoader.findById(doctorId);
    if (!info || !info.isActive) {
      throw new DoctorNotFoundError();
    }
    return info;
  }
}
