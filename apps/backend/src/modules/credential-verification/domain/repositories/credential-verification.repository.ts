import type {
  CredentialVerification,
  VerificationStatus,
  VerificationEvidence,
} from '../entities/credential-verification.entity';

export const CREDENTIAL_VERIFICATION_REPOSITORY = Symbol('ICredentialVerificationRepository');

export interface UpsertVerificationParams {
  doctorId: string;
  credentialType: string;
  declaredValue: string | null;
  verifierId: string | null;
  status: VerificationStatus;
  evidence: VerificationEvidence | null;
  checkedAt: Date | null;
  lastError: string | null;
}

export interface ICredentialVerificationRepository {
  /**
   * Finds the verification record for a doctor + credential type pair.
   * Returns null when no record exists.
   */
  findByDoctorAndType(
    doctorId: string,
    credentialType: string,
  ): Promise<CredentialVerification | null>;

  /**
   * Returns all verification records for a doctor.
   */
  findAllByDoctor(doctorId: string): Promise<CredentialVerification[]>;

  /**
   * Upserts (insert-or-update) a verification record.
   * On conflict (doctor_id, credential_type): updates all mutable fields and
   * increments attempts.
   */
  upsert(params: UpsertVerificationParams): Promise<CredentialVerification>;
}
