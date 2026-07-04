import type { PatientRequestAccessCode } from '../entities/patient-request-access-code.entity';

export const PATIENT_REQUEST_ACCESS_CODE_REPOSITORY = Symbol('IPatientRequestAccessCodeRepository');

/**
 * Contract for patient_request_access_codes persistence.
 */
export interface IPatientRequestAccessCodeRepository {
  /** Persist a new access code. */
  save(code: PatientRequestAccessCode): Promise<PatientRequestAccessCode>;

  /**
   * Find the most recent (by created_at DESC) access code for a given request.
   * Returns null when no codes exist for that request.
   */
  findLatestByRequestId(requestId: string): Promise<PatientRequestAccessCode | null>;

  /** Increment failed_attempts by 1 for the given code record. */
  incrementFailedAttempts(id: string): Promise<void>;

  /** Mark a code as used by setting used_at to the given timestamp. */
  markUsed(id: string, usedAt: Date): Promise<void>;
}
