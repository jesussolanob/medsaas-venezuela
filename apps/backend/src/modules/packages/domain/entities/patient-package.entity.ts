/**
 * PatientPackage domain entity.
 *
 * Represents a pre-paid session package purchased by a patient from a doctor.
 *
 * Invariants enforced here:
 *   - remainingSessions is derived from totalSessions and usedSessions.
 *   - isAvailableFor() combines doctor ownership, active status, and remaining sessions.
 *   - wouldCompleteAfterUse() signals when the next consumption exhausts the package.
 */
export type PackageStatus = 'active' | 'completed';

export interface PatientPackageCreateParams {
  id: string;
  doctorId: string;
  patientId: string | null;
  authUserId?: string | null;
  packageTemplateId?: string | null;
  planName: string;
  specialty?: string | null;
  totalSessions: number;
  usedSessions: number;
  status: PackageStatus;
  purchasedAmountUsd?: number | null;
  notifiedOneLeft?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class PatientPackage {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string | null;
  readonly authUserId: string | null;
  readonly packageTemplateId: string | null;
  readonly planName: string;
  readonly specialty: string | null;
  readonly totalSessions: number;
  readonly usedSessions: number;
  readonly status: PackageStatus;
  readonly purchasedAmountUsd: number | null;
  readonly notifiedOneLeft: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PatientPackageCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.authUserId = params.authUserId ?? null;
    this.packageTemplateId = params.packageTemplateId ?? null;
    this.planName = params.planName;
    this.specialty = params.specialty ?? null;
    this.totalSessions = params.totalSessions;
    this.usedSessions = params.usedSessions;
    this.status = params.status;
    this.purchasedAmountUsd = params.purchasedAmountUsd ?? null;
    this.notifiedOneLeft = params.notifiedOneLeft ?? false;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Derived: how many sessions remain in this package. */
  get remainingSessions(): number {
    return this.totalSessions - this.usedSessions;
  }

  /**
   * Returns true when this package is usable for a given doctor.
   * All three conditions must hold: correct doctor, active status, and sessions remaining.
   */
  isAvailableFor(doctorId: string): boolean {
    return this.doctorId === doctorId && this.status === 'active' && this.remainingSessions > 0;
  }

  /**
   * Returns true when consuming one more session would exhaust all sessions,
   * transitioning the package to 'completed'.
   */
  wouldCompleteAfterUse(): boolean {
    return this.usedSessions + 1 >= this.totalSessions;
  }

  /** Factory — creates a PatientPackage from raw data without persisting. */
  static create(params: PatientPackageCreateParams): PatientPackage {
    return new PatientPackage(params);
  }
}
