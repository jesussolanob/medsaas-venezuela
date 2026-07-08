/**
 * SharedFile domain entity.
 *
 * Represents a task, instruction, comment, or file exchanged between a doctor
 * and a patient in the "Seguimiento del Paciente" (Shared Health Space) feature.
 *
 * Invariants enforced here:
 *   - canBeModifiedByDoctor()  — only the owning doctor may patch or delete.
 *   - canBeModifiedByPatient() — only the owning patient (by id) may patch or delete.
 *   - isOwnedBy()              — checks either side for anti-IDOR.
 *
 * No external framework imports — domain/ is framework-free.
 */

export type SharedFileCategory =
  | 'instruction'
  | 'file'
  | 'recipe'
  | 'lab_result'
  | 'image'
  | 'other'
  | 'comment';

export type SharedFileStatus = 'pending' | 'completed' | 'reviewed';

export type SharedFileCreatedBy = 'doctor' | 'patient';

export interface SharedFileCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  title: string;
  description: string | null;
  /** GCS object path (not a signed URL). Null for text-only entries. */
  filePath: string | null;
  fileType: string | null;
  fileSizeBytes: number | null;
  category: SharedFileCategory;
  status: SharedFileStatus;
  createdBy: SharedFileCreatedBy;
  parentTaskId: string | null;
  readByDoctor: boolean;
  readByPatient: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SharedFile {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly title: string;
  readonly description: string | null;
  /** GCS object path stored in DB. Signed URL is resolved at read time. */
  readonly filePath: string | null;
  readonly fileType: string | null;
  readonly fileSizeBytes: number | null;
  readonly category: SharedFileCategory;
  readonly status: SharedFileStatus;
  readonly createdBy: SharedFileCreatedBy;
  readonly parentTaskId: string | null;
  readonly readByDoctor: boolean;
  readonly readByPatient: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: SharedFileCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.title = params.title;
    this.description = params.description;
    this.filePath = params.filePath;
    this.fileType = params.fileType;
    this.fileSizeBytes = params.fileSizeBytes;
    this.category = params.category;
    this.status = params.status;
    this.createdBy = params.createdBy;
    this.parentTaskId = params.parentTaskId;
    this.readByDoctor = params.readByDoctor;
    this.readByPatient = params.readByPatient;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given doctorId is the owner. Used for anti-IDOR. */
  canBeModifiedByDoctor(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Returns true when the given patientId is the owner. Used for anti-IDOR. */
  canBeModifiedByPatient(patientId: string): boolean {
    return this.patientId === patientId;
  }

  /** Factory — creates a SharedFile value from raw data. Does not persist. */
  static create(params: SharedFileCreateParams): SharedFile {
    return new SharedFile(params);
  }
}
