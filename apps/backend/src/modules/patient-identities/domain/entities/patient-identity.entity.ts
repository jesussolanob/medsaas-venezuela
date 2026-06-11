/**
 * PatientIdentity — global identity master record for a unique cedula.
 *
 * One row exists per distinct cedula across the entire platform. The record
 * is created the first time any doctor registers a patient with that cedula,
 * and is NEVER deleted even when the patient record is soft-deleted.
 *
 * Domain invariants:
 *   - cedulaHash must be a non-empty string (64-char HMAC-SHA256 hex).
 *   - cedulaEncrypted must be a non-empty base64 AES-256-GCM ciphertext.
 *
 * This entity carries NO PII in plaintext — the domain layer never decrypts
 * the cedula; that is only done in the infrastructure layer when strictly
 * required for compliance/recovery operations (out of scope for Phase 3).
 *
 * PRIVACY: This entity and its repository are NEVER exposed via HTTP API.
 * They are consumed only by internal use cases (CreatePatient, CreateBooking).
 */
export interface PatientIdentityCreateParams {
  id: string;
  cedulaHash: string;
  cedulaEncrypted: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PatientIdentity {
  readonly id: string;
  readonly cedulaHash: string;
  readonly cedulaEncrypted: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PatientIdentityCreateParams) {
    if (!params.cedulaHash) {
      throw new Error('PatientIdentity: cedulaHash is required');
    }
    if (!params.cedulaEncrypted) {
      throw new Error('PatientIdentity: cedulaEncrypted is required');
    }

    this.id = params.id;
    this.cedulaHash = params.cedulaHash;
    this.cedulaEncrypted = params.cedulaEncrypted;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Factory — does not persist. */
  static create(params: PatientIdentityCreateParams): PatientIdentity {
    return new PatientIdentity(params);
  }
}
