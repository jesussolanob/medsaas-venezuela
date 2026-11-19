import type { DoctorDocumentFile } from '../entities/doctor-document-file.entity';

export const DOCTOR_DOCUMENT_FILE_REPOSITORY = Symbol('IDoctorDocumentFileRepository');

/**
 * Contract for doctor_document_files persistence.
 *
 * All queries are scoped to a specific doctor (anti-IDOR).
 * Soft-deleted rows are excluded from list / findById unless noted.
 */
export interface IDoctorDocumentFileRepository {
  /**
   * Returns all active (non-deleted) files for the given doctor,
   * ordered by created_at DESC.
   */
  findAllByDoctor(doctorId: string): Promise<DoctorDocumentFile[]>;

  /**
   * Returns a single active file owned by the given doctor.
   * Returns null when not found or soft-deleted.
   */
  findById(id: string, doctorId: string): Promise<DoctorDocumentFile | null>;

  /**
   * Returns all active files whose ids are in the provided list AND
   * are owned by the given doctor.
   *
   * Files that are soft-deleted or belong to another doctor are silently
   * excluded — the caller must compare the returned count to detect missing ids.
   *
   * Uses IN (:ids) — never = ANY(:ids) — for Sequelize mock compatibility.
   */
  findByIdsAndDoctor(ids: string[], doctorId: string): Promise<DoctorDocumentFile[]>;

  /**
   * Counts active (non-deleted) files for the given doctor.
   * Used to enforce the per-doctor file limit.
   */
  countActiveByDoctor(doctorId: string): Promise<number>;

  /** Persist a new file record. */
  save(file: DoctorDocumentFile): Promise<DoctorDocumentFile>;

  /**
   * Rename an active file owned by the given doctor.
   * No-op when the file is not found or not owned by this doctor.
   */
  rename(id: string, doctorId: string, name: string): Promise<void>;

  /**
   * Soft-delete a file owned by the given doctor.
   * Sets deleted_at = NOW(). No-op when already deleted or not found.
   */
  softDelete(id: string, doctorId: string): Promise<void>;
}
