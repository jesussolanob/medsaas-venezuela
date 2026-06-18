import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_DOCTOR_LOADER,
  type IBookingDoctorLoader,
  type DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';
import {
  BOOKING_FEATURE_CHECKER,
  type IBookingFeatureChecker,
} from '../../../domain/repositories/booking-feature-checker.repository';
import { DoctorNotFoundError } from './create-booking.use-case';

export interface DoctorPublicInfoWithBooking extends DoctorPublicInfo {
  /** Whether the doctor's effective subscription plan includes online booking. */
  bookingEnabled: boolean;
}

/**
 * Returns public doctor profile info for the booking form, including whether
 * the booking feature is enabled for the doctor's current effective plan.
 *
 * bookingEnabled=false signals the frontend to hide the booking widget/QR.
 * The CreateBookingUseCase enforces the same check server-side (defence in depth).
 *
 * Throws DoctorNotFoundError (→ 404 via GlobalExceptionFilter) when the doctor
 * does not exist or is inactive — prevents oracle-style enumeration.
 */
@Injectable()
export class GetBookingDoctorInfoUseCase {
  constructor(
    @Inject(BOOKING_DOCTOR_LOADER)
    private readonly doctorLoader: IBookingDoctorLoader,
    @Inject(BOOKING_FEATURE_CHECKER)
    private readonly featureChecker: IBookingFeatureChecker,
  ) {}

  async execute(doctorId: string): Promise<DoctorPublicInfoWithBooking> {
    const info = await this.doctorLoader.findById(doctorId);
    if (!info || !info.isActive) {
      throw new DoctorNotFoundError();
    }

    const bookingEnabled = await this.featureChecker.isBookingEnabled(doctorId);

    return { ...info, bookingEnabled };
  }
}
