import type { DoctorProfile, DoctorProfileUpdateParams } from '../entities/doctor-profile.entity';

export const DOCTOR_PROFILE_REPOSITORY = Symbol('IDoctorProfileRepository');

export interface ExchangeRateUpdateParams {
  currencyMode: string;
  customRate: number | null;
  customRateLabel: string | null;
}

export interface IDoctorProfileRepository {
  /** Find the doctor's own profile by their user id. Returns null when not found. */
  findByDoctorId(doctorId: string): Promise<DoctorProfile | null>;

  /** Persist updated profile fields. Returns the updated domain entity. */
  update(doctorId: string, params: DoctorProfileUpdateParams): Promise<DoctorProfile>;

  /** Persist the doctor's exchange-rate preference. Returns the updated domain entity. */
  updateExchangeRate(doctorId: string, params: ExchangeRateUpdateParams): Promise<DoctorProfile>;

  /**
   * Sets onboarding_completed_at to NOW() for the given doctor.
   * Idempotent: safe to call multiple times.
   */
  markOnboardingCompleted(doctorId: string): Promise<void>;

  /**
   * Persists the consultation_blocks_layout for the given doctor.
   */
  updateBlocksLayout(doctorId: string, layout: 'tabs' | 'vertical'): Promise<void>;
}
