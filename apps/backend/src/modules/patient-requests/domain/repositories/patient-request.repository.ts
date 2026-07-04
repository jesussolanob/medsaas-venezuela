import type { PatientRequest } from '../entities/patient-request.entity';

export const PATIENT_REQUEST_REPOSITORY = Symbol('IPatientRequestRepository');

/**
 * Contract for patient_requests persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation — to keep the domain infrastructure-free.
 */
export interface IPatientRequestRepository {
  /** Persist a new request. */
  save(request: PatientRequest): Promise<PatientRequest>;

  /** Find a request by its public URL token. Returns null if not found. */
  findByToken(token: string): Promise<PatientRequest | null>;

  /** Find a request by its internal ID, scoped to the owning doctor (anti-IDOR). */
  findById(id: string, doctorId: string): Promise<PatientRequest | null>;

  /** List all requests for a doctor ordered by createdAt DESC. */
  listByDoctor(doctorId: string): Promise<PatientRequest[]>;

  /**
   * Atomically increment the request-level failed_attempts counter by 1.
   * Used by verify-code to accumulate failures across all code rotations.
   */
  incrementLinkFailedAttempts(id: string): Promise<void>;

  /**
   * Set last_code_requested_at to the given timestamp.
   * Used by request-code to enforce the 60-second cooldown.
   */
  updateLastCodeRequestedAt(id: string, at: Date): Promise<void>;

  /**
   * Mark the request as fulfilled, storing the optional response text.
   * Sets status='fulfilled' and fulfilled_at=fulfilledAt.
   */
  markFulfilled(id: string, fulfilledAt: Date, responseText: string | null): Promise<void>;
}
