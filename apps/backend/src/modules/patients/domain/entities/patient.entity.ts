/**
 * Patient domain entity.
 *
 * Holds decrypted (plaintext) PII in memory — encryption/decryption is the
 * responsibility of the infrastructure layer (SequelizePatientRepository).
 *
 * Invariants enforced here:
 *   - canBeAccessedBy() enforces doctor ownership (anti-IDOR).
 */
// Known values from spec 02-patients.md. Kept as a closed union so new sources
// require an explicit addition here. Legacy DB data outside this set is coerced
// to null by parseSource() in the repository layer.
export type PatientSource = 'booking' | 'manual' | 'import' | 'invitation';

export interface PatientCreateParams {
  id: string;
  doctorId: string;
  authUserId?: string | null;
  fullName: string;
  cedula?: string | null;
  phone?: string | null;
  email?: string | null;
  /**
   * Global identity reference — UUID from patient_identities master table.
   * Set when the patient has a cedula; null otherwise.
   * Internal only: never exposed in API responses.
   */
  identityId?: string | null;
  source?: PatientSource | null;
  birthDate?: string | null;
  age?: number | null;
  sex?: 'male' | 'female' | 'other' | null;
  bloodType?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  address?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Patient {
  readonly id: string;
  readonly doctorId: string;
  readonly authUserId: string | null;
  readonly fullName: string;
  readonly cedula: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  /** Internal only — global identity UUID; never returned in API responses. */
  readonly identityId: string | null;
  readonly source: PatientSource | null;
  readonly birthDate: string | null;
  readonly age: number | null;
  readonly sex: 'male' | 'female' | 'other' | null;
  readonly bloodType: string | null;
  readonly allergies: string | null;
  readonly chronicConditions: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly emergencyContactRelationship: string | null;
  readonly notes: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PatientCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.authUserId = params.authUserId ?? null;
    this.fullName = params.fullName;
    this.cedula = params.cedula ?? null;
    this.phone = params.phone ?? null;
    this.email = params.email ?? null;
    this.identityId = params.identityId ?? null;
    this.source = params.source ?? null;
    this.birthDate = params.birthDate ?? null;
    this.age = params.age ?? null;
    this.sex = params.sex ?? null;
    this.bloodType = params.bloodType ?? null;
    this.allergies = params.allergies ?? null;
    this.chronicConditions = params.chronicConditions ?? null;
    this.address = params.address ?? null;
    this.city = params.city ?? null;
    this.emergencyContactName = params.emergencyContactName ?? null;
    this.emergencyContactPhone = params.emergencyContactPhone ?? null;
    this.emergencyContactRelationship = params.emergencyContactRelationship ?? null;
    this.notes = params.notes ?? null;
    this.deletedAt = params.deletedAt ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Returns true when the given doctor is the owner of this patient record.
   * Used to enforce anti-IDOR on all read and write operations.
   */
  canBeAccessedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Factory — creates a Patient value from raw data. Does not persist. */
  static create(params: PatientCreateParams): Patient {
    return new Patient(params);
  }
}
