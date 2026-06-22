/**
 * DoctorRegistration — lightweight domain entity representing the verification
 * state of a doctor's profile.
 *
 * No external dependencies (DDD domain rule).
 */
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface DoctorRegistrationProps {
  id: string;
  fullName: string;
  email: string;
  cedula: string | null;
  mppsNumber: string | null;
  colegiadoNumber: string | null;
  specialty: string | null;
  verificationStatus: VerificationStatus;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  createdAt: Date;
  /** Whether the account is active. NULL from DB is normalised to true (fail-open). */
  isActive: boolean;
}

export class DoctorRegistration {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly cedula: string | null;
  readonly mppsNumber: string | null;
  readonly colegiadoNumber: string | null;
  readonly specialty: string | null;
  readonly verificationStatus: VerificationStatus;
  readonly verifiedAt: Date | null;
  readonly verifiedBy: string | null;
  readonly createdAt: Date;
  /** Whether the account is active. Always a boolean (null normalised to true). */
  readonly isActive: boolean;

  private constructor(props: DoctorRegistrationProps) {
    this.id = props.id;
    this.fullName = props.fullName;
    this.email = props.email;
    this.cedula = props.cedula;
    this.mppsNumber = props.mppsNumber;
    this.colegiadoNumber = props.colegiadoNumber;
    this.specialty = props.specialty;
    this.verificationStatus = props.verificationStatus;
    this.verifiedAt = props.verifiedAt;
    this.verifiedBy = props.verifiedBy;
    this.createdAt = props.createdAt;
    this.isActive = props.isActive;
  }

  static create(props: DoctorRegistrationProps): DoctorRegistration {
    return new DoctorRegistration(props);
  }

  isPending(): boolean {
    return this.verificationStatus === 'pending';
  }

  isVerified(): boolean {
    return this.verificationStatus === 'verified';
  }

  isRejected(): boolean {
    return this.verificationStatus === 'rejected';
  }

  /**
   * Returns a new entity with the verification status updated.
   * Immutable update — does not mutate the original.
   */
  withVerification(
    status: 'verified' | 'rejected',
    verifiedBy: string,
    verifiedAt: Date,
  ): DoctorRegistration {
    return DoctorRegistration.create({
      id: this.id,
      fullName: this.fullName,
      email: this.email,
      cedula: this.cedula,
      mppsNumber: this.mppsNumber,
      colegiadoNumber: this.colegiadoNumber,
      specialty: this.specialty,
      verificationStatus: status,
      verifiedAt,
      verifiedBy,
      createdAt: this.createdAt,
      isActive: this.isActive,
    });
  }

  /**
   * Returns a new entity with updated registration fields.
   * Immutable update — does not mutate the original.
   */
  withRegistrationUpdate(params: {
    fullName: string;
    cedula: string;
    mppsNumber: string | null;
    colegiadoNumber: string | null;
    specialty: string | null;
  }): DoctorRegistration {
    return DoctorRegistration.create({
      id: this.id,
      fullName: params.fullName,
      email: this.email,
      cedula: params.cedula,
      mppsNumber: params.mppsNumber,
      colegiadoNumber: params.colegiadoNumber,
      specialty: params.specialty,
      verificationStatus: 'pending',
      verifiedAt: null,
      verifiedBy: null,
      createdAt: this.createdAt,
      isActive: this.isActive,
    });
  }
}
