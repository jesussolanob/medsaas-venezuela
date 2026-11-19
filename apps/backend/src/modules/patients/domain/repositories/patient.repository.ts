import type { Patient } from '../entities/patient.entity';

export const PATIENT_REPOSITORY = Symbol('IPatientRepository');

export interface PatientListFilters {
  doctorId: string;
  source?: string;
  page: number;
  limit: number;
}

export interface PatientListResult {
  items: Patient[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogEntry {
  actorId: string;
  actorRole: string;
  patientId: string;
  fieldRevealed: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** Optional free-text detail stored in the reason column (no PII). */
  reason?: string | null;
}

export interface IPatientRepository {
  /**
   * Fetch a single patient by ID scoped to the owning doctor.
   * Returns null if not found, soft-deleted, or owned by a different doctor.
   * Scoping prevents existence enumeration — callers see the same "not found"
   * response regardless of whether the patient belongs to another doctor.
   */
  findById(id: string, doctorId: string): Promise<Patient | null>;

  /** Find a patient by the HMAC hash of their cédula for a given doctor. */
  findByCedulaHash(cedulaHash: string, doctorId: string): Promise<Patient | null>;

  /** Find a patient by the HMAC hash of their email for a given doctor. */
  findByEmailHash(emailHash: string, doctorId: string): Promise<Patient | null>;

  /** List patients for a doctor, with pagination and optional source filter. */
  list(filters: PatientListFilters): Promise<PatientListResult>;

  /**
   * Fetch all active patients for a doctor without pagination.
   * Used for in-app substring search on decrypted names.
   */
  findAllByDoctor(doctorId: string): Promise<Patient[]>;

  /** Persist a new patient. Encryption is the caller's responsibility. */
  save(patient: Patient): Promise<Patient>;

  /**
   * Update fields on an existing patient, scoped to the owning doctor.
   * Returns null if the patient does not exist or belongs to a different doctor.
   */
  update(id: string, doctorId: string, fields: Partial<Patient>): Promise<Patient>;

  /**
   * Soft-delete a patient, scoped to the owning doctor.
   * No-ops silently if the patient does not belong to the given doctor.
   */
  softDelete(id: string, doctorId: string): Promise<void>;

  /** Insert a row into access_audit_log. Fire-and-forget in terms of errors. */
  logReveal(entry: AuditLogEntry): Promise<void>;

  /**
   * Merge a patient-submitted health note into the allergies field.
   *
   * Rules (all comparisons are case/whitespace-insensitive):
   *   1. If allergies is null/blank  → set it to `text`.
   *   2. If allergies already contains `text` → leave it unchanged (idempotent).
   *   3. Otherwise → append on a new line:
   *        `<text> (indicado por el paciente al reservar el DD/MM/AAAA)`
   *        where the date is in America/Caracas time.
   *
   * Ownership-scoped (doctorId): a patient owned by a different doctor
   * is treated as not found — no cross-doctor mutation.
   *
   * Returns true when the field was updated; false when the text was
   * already present or the patient was not found.
   *
   * SECURITY: `text` is health data — never log its value.
   */
  appendAllergyNote(
    patientId: string,
    doctorId: string,
    text: string,
    at: Date,
    transaction?: import('sequelize').Transaction,
  ): Promise<boolean>;
}
