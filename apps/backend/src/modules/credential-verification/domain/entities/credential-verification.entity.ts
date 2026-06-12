/**
 * CredentialVerification — domain entity representing the result of a
 * credential verification attempt for a specific doctor.
 *
 * Status machine:
 *   pending → verified | not_found | mismatch | error
 *   verified is terminal (no re-check unless forced).
 *
 * No external dependencies (DDD domain rule).
 */

export type VerificationStatus = 'pending' | 'verified' | 'not_found' | 'mismatch' | 'error';

export interface VerificationEvidence {
  fechaRegistro?: string;
  tomoRegistro?: string;
  folioRegistro?: string;
  profesion?: string;
  matchedName?: string;
}

export interface CredentialVerificationProps {
  id: string;
  doctorId: string;
  credentialType: string;
  declaredValue: string | null;
  verifierId: string | null;
  status: VerificationStatus;
  evidence: VerificationEvidence | null;
  checkedAt: Date | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CredentialVerification {
  readonly id: string;
  readonly doctorId: string;
  readonly credentialType: string;
  readonly declaredValue: string | null;
  readonly verifierId: string | null;
  readonly status: VerificationStatus;
  readonly evidence: VerificationEvidence | null;
  readonly checkedAt: Date | null;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CredentialVerificationProps) {
    this.id = props.id;
    this.doctorId = props.doctorId;
    this.credentialType = props.credentialType;
    this.declaredValue = props.declaredValue;
    this.verifierId = props.verifierId;
    this.status = props.status;
    this.evidence = props.evidence;
    this.checkedAt = props.checkedAt;
    this.attempts = props.attempts;
    this.lastError = props.lastError;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CredentialVerificationProps): CredentialVerification {
    return new CredentialVerification(props);
  }

  isVerified(): boolean {
    return this.status === 'verified';
  }

  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Returns a new entity transitioned to the verified state.
   * Immutable update — does not mutate the original.
   */
  withVerified(
    verifierId: string,
    evidence: VerificationEvidence,
    checkedAt: Date,
  ): CredentialVerification {
    return CredentialVerification.create({
      ...this.toProps(),
      verifierId,
      status: 'verified',
      evidence,
      checkedAt,
      lastError: null,
      attempts: this.attempts + 1,
    });
  }

  /**
   * Returns a new entity transitioned to a non-verified terminal state.
   * Immutable update — does not mutate the original.
   */
  withFailure(
    status: 'not_found' | 'mismatch' | 'error',
    verifierId: string | null,
    checkedAt: Date,
    lastError: string | null,
  ): CredentialVerification {
    return CredentialVerification.create({
      ...this.toProps(),
      verifierId: verifierId ?? this.verifierId,
      status,
      checkedAt,
      lastError,
      attempts: this.attempts + 1,
    });
  }

  private toProps(): CredentialVerificationProps {
    return {
      id: this.id,
      doctorId: this.doctorId,
      credentialType: this.credentialType,
      declaredValue: this.declaredValue,
      verifierId: this.verifierId,
      status: this.status,
      evidence: this.evidence,
      checkedAt: this.checkedAt,
      attempts: this.attempts,
      lastError: this.lastError,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
