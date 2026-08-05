export const DOCTOR_INACTIVITY_REPOSITORY = 'DOCTOR_INACTIVITY_REPOSITORY';

/**
 * A slim projection of `profiles` used by the doctor-inactivity dispatch use case.
 * Includes email/fullName directly (single JOIN-free query against `profiles`)
 * to avoid N+1 lookups — every row here is already a distinct doctor.
 */
export interface InactiveDoctorCandidate {
  doctorId: string;
  email: string;
  fullName: string | null;
  lastSignInAt: Date;
  /** 0 = never notified, 1 = 10-day notice sent, 2 = 15-day notice sent. */
  inactivityNoticeStage: number;
}

/**
 * Contract for reading/writing per-doctor inactivity notice state on `profiles`.
 */
export interface IDoctorInactivityRepository {
  /**
   * Returns active doctors eligible for an inactivity notice:
   *   role = 'doctor' AND is_active = true AND last_sign_in_at IS NOT NULL
   *   AND inactivity_notice_stage < 2 (stage 2 = fully escalated, nothing left to send)
   *
   * Ordered by last_sign_in_at ASC (longest-inactive first), capped at `cap` rows.
   * Backed by the partial index idx_profiles_doctor_last_sign_in.
   */
  findCandidates(cap: number): Promise<InactiveDoctorCandidate[]>;

  /**
   * Persists the new inactivity_notice_stage and last_inactivity_notice_at for
   * a doctor after a notice email has been sent. Idempotent.
   */
  markNoticeSent(doctorId: string, stage: number, sentAt: Date): Promise<void>;
}
