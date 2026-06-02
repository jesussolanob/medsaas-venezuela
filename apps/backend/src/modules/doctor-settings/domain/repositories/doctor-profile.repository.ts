import type { DoctorProfile, DoctorProfileUpdateParams } from '../entities/doctor-profile.entity';

export const DOCTOR_PROFILE_REPOSITORY = Symbol('IDoctorProfileRepository');

export interface IDoctorProfileRepository {
  /** Find the doctor's own profile by their user id. Returns null when not found. */
  findByDoctorId(doctorId: string): Promise<DoctorProfile | null>;

  /** Persist updated profile fields. Returns the updated domain entity. */
  update(doctorId: string, params: DoctorProfileUpdateParams): Promise<DoctorProfile>;
}
