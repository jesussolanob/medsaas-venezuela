import type { PatientIdentity } from '../entities/patient-identity.entity';

export const PATIENT_IDENTITY_REPOSITORY = Symbol('IPatientIdentityRepository');

/**
 * Contract for the patient_identities persistence store.
 *
 * PRIVACY NOTE: Implementations of this interface are internal-only.
 * No controller or public endpoint may inject or expose this repository.
 */
export interface IPatientIdentityRepository {
  /**
   * Find a global identity record by its cedula HMAC hash.
   * Returns null if no identity has been registered for that cedula.
   */
  findByCedulaHash(cedulaHash: string): Promise<PatientIdentity | null>;

  /**
   * Persist a new PatientIdentity row.
   * Callers must handle unique-violation errors (UNIQUE on cedula_hash)
   * for race-condition safety.
   */
  save(identity: PatientIdentity): Promise<PatientIdentity>;
}
