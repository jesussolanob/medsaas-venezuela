import type { DoctorScheduleParams } from '../value-objects/doctor-schedule.vo';

export const DOCTOR_SCHEDULE_REPOSITORY = Symbol('IDoctorScheduleRepository');

export interface IDoctorScheduleRepository {
  /** Find the doctor's schedule configuration. Returns null when no schedule exists yet. */
  findByDoctorId(doctorId: string): Promise<DoctorScheduleParams | null>;

  /** Upsert the schedule for a doctor. Returns the saved schedule params. */
  upsert(doctorId: string, params: DoctorScheduleParams): Promise<DoctorScheduleParams>;
}
