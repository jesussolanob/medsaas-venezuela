/**
 * EHR record domain entity.
 *
 * Holds decrypted (plaintext) clinical data in memory — encryption/decryption is
 * the responsibility of the infrastructure layer (SequelizeEhrRepository).
 *
 * Business invariants enforced here:
 *   - canBeModifiedBy() enforces doctor ownership (anti-IDOR).
 */
export interface EhrRecordCreateParams {
  id: string;
  patientId: string;
  doctorId: string;
  consultationId?: string | null;
  diagnosis?: string | null;
  treatmentPlan?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EhrRecord {
  readonly id: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly consultationId: string | null;
  readonly diagnosis: string | null;
  readonly treatmentPlan: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: EhrRecordCreateParams) {
    this.id = params.id;
    this.patientId = params.patientId;
    this.doctorId = params.doctorId;
    this.consultationId = params.consultationId ?? null;
    this.diagnosis = params.diagnosis ?? null;
    this.treatmentPlan = params.treatmentPlan ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Returns true when the given doctor owns this EHR record.
   * Used to enforce anti-IDOR on all read and write operations.
   */
  canBeModifiedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Factory — creates an EhrRecord from raw (plaintext) data. Does not persist. */
  static create(params: EhrRecordCreateParams): EhrRecord {
    return new EhrRecord(params);
  }
}
