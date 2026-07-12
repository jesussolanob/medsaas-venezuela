/**
 * Prescription domain entity.
 *
 * Holds decrypted (plaintext) clinical data in memory — encryption/decryption is
 * the responsibility of the infrastructure layer (SequelizePrescriptionRepository).
 *
 * Business invariants enforced here:
 *   - canBeModifiedBy() enforces doctor ownership (anti-IDOR).
 *
 * COLUMN NAMES NOTE: the real DB column is `medication` (NOT `medication_name`)
 * and `notes` (NOT `instructions`). The plan doc 05-ehr-prescriptions.md was
 * outdated — schema T-09 in 03b-schema-real.md is authoritative.
 *
 * DEFERRED: access for role 'patient' is not implemented here — it belongs in the
 * patient-portal module. All access here is doctor-only.
 */
export interface PrescriptionCreateParams {
  id: string;
  patientId?: string | null;
  doctorId: string;
  consultationId?: string | null;
  medication: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string | null;
  presentation?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Prescription {
  readonly id: string;
  readonly patientId: string | null;
  readonly doctorId: string;
  readonly consultationId: string | null;
  readonly medication: string;
  readonly dosage: string | null;
  readonly frequency: string | null;
  readonly duration: string | null;
  readonly notes: string | null;
  readonly presentation: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PrescriptionCreateParams) {
    this.id = params.id;
    this.patientId = params.patientId ?? null;
    this.doctorId = params.doctorId;
    this.consultationId = params.consultationId ?? null;
    this.medication = params.medication;
    this.dosage = params.dosage ?? null;
    this.frequency = params.frequency ?? null;
    this.duration = params.duration ?? null;
    this.notes = params.notes ?? null;
    this.presentation = params.presentation ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Returns true when the given doctor owns this prescription.
   * Used to enforce anti-IDOR on all read and write operations.
   *
   * TODO (patient-portal): when patient access is added, extend this to accept
   * an actorRole and check patientId === actorId for role === 'patient'.
   */
  canBeModifiedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Factory — creates a Prescription from raw (plaintext) data. Does not persist. */
  static create(params: PrescriptionCreateParams): Prescription {
    return new Prescription(params);
  }
}
