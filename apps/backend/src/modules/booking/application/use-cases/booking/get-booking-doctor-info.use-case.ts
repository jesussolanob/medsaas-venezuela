import { Inject, Injectable, Optional } from '@nestjs/common';
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
import {
  DOCTOR_SCHEDULE_REPOSITORY,
  type IDoctorScheduleRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-schedule.repository';
import {
  STORAGE_PORT,
  type IStoragePort,
} from '../../../../storage/application/ports/storage.port';
import { resignGcsImageUrl } from '../../../../storage/application/helpers/resign-gcs-image.helper';

export interface DoctorPublicInfoWithBooking extends DoctorPublicInfo {
  /** Whether the doctor's effective subscription plan includes online booking. */
  bookingEnabled: boolean;
  /** Whether the booking form must collect a chief complaint (motivo de consulta). */
  requireReason: boolean;
  /** Minimum calendar days ahead required for public bookings (0 = no restriction). */
  minLeadDays: number;
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
    /**
     * Schedule repository — optional for backward compatibility with existing
     * tests that do not inject it. When absent, requireReason and minLeadDays
     * default to false / 0 (no restrictions).
     */
    @Optional()
    @Inject(DOCTOR_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IDoctorScheduleRepository | null = null,
    /**
     * Storage port — optional for backward compatibility with existing tests.
     * When present, GCS avatar URLs are re-signed at read time so they are
     * always accessible (GCS v4 signed URLs expire after at most 7 days).
     */
    @Optional()
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort | null = null,
  ) {}

  async execute(doctorId: string): Promise<DoctorPublicInfoWithBooking> {
    const info = await this.doctorLoader.findById(doctorId);
    if (!info || !info.isActive) {
      throw new DoctorNotFoundError();
    }

    // Load feature flag and schedule in parallel — both are independent reads.
    const [bookingEnabled, schedule] = await Promise.all([
      this.featureChecker.isBookingEnabled(doctorId),
      this.scheduleRepo ? this.scheduleRepo.findByDoctorId(doctorId) : Promise.resolve(null),
    ]);

    // Re-sign the avatar URL if this is a GCS URL (may be expired).
    const freshAvatarUrl = this.storagePort
      ? await resignGcsImageUrl(info.avatarUrl, this.storagePort)
      : info.avatarUrl;

    return {
      ...info,
      avatarUrl: freshAvatarUrl,
      bookingEnabled,
      requireReason: schedule?.bookingRequireReason ?? false,
      minLeadDays: schedule?.bookingMinLeadDays ?? 0,
    };
  }
}
