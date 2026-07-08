import type { SharedFile } from '../entities/shared-file.entity';

export const SHARED_FILE_REPOSITORY = Symbol('ISharedFileRepository');

export interface SharedFileListResult {
  items: SharedFile[];
}

export interface UnreadCountsResult {
  /** Maps patientId → count of unread items created_by='patient'. */
  [patientId: string]: number;
}

export interface ISharedFileRepository {
  /**
   * Persist a new shared file. Returns the saved entity (with generated id / timestamps).
   */
  save(sf: SharedFile): Promise<SharedFile>;

  /**
   * Find a shared file by id, scoped to the given doctorId.
   * Returns null if not found or belongs to a different doctor (anti-IDOR).
   */
  findByIdAndDoctor(id: string, doctorId: string): Promise<SharedFile | null>;

  /**
   * Find a shared file by id, scoped to the given patientId.
   * Returns null if not found or belongs to a different patient (anti-IDOR).
   */
  findByIdAndPatient(id: string, patientId: string): Promise<SharedFile | null>;

  /**
   * List all shared files for a (doctorId, patientId) pair, ordered ASC by created_at.
   */
  listByDoctorAndPatient(doctorId: string, patientId: string): Promise<SharedFile[]>;

  /**
   * List all shared files for a patientId, ordered ASC by created_at.
   */
  listByPatient(patientId: string): Promise<SharedFile[]>;

  /**
   * Update fields on an existing shared file. Returns the updated entity.
   * Caller must verify ownership before invoking.
   */
  update(
    id: string,
    fields: {
      title?: string;
      description?: string | null;
      status?: string;
      readByDoctor?: boolean;
      readByPatient?: boolean;
    },
  ): Promise<SharedFile | null>;

  /**
   * Hard-delete a shared file row. GCS object cleanup is deferred.
   * TODO: implement GCS object deletion when the storage abstraction supports it.
   */
  delete(id: string): Promise<void>;

  /**
   * Mark read_by_doctor = true on all files created_by='patient' for a given patient.
   */
  markReadByDoctor(doctorId: string, patientId: string): Promise<void>;

  /**
   * Mark read_by_patient = true on all files created_by='doctor' for the given patient.
   */
  markReadByPatient(patientId: string): Promise<void>;

  /**
   * Returns a map of patientId → count of unread items (created_by='patient', read_by_doctor=false)
   * grouped by patient_id for the given doctorId.
   */
  getUnreadCountsByDoctor(doctorId: string): Promise<UnreadCountsResult>;
}
