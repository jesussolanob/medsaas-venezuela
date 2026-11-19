/**
 * DoctorDocumentFile domain entity.
 *
 * Represents a reusable file (PDF or image) stored in the doctor's
 * "Documentos frecuentes" library. Doctors upload a file once and can
 * attach it to any consultation share without re-uploading.
 *
 * Business invariants:
 * - name must be 1–120 non-whitespace characters.
 * - mimeType must be one of the ALLOWED_MIME_TYPES.
 * - sizeBytes must be positive.
 * - Soft-deleted files (deletedAt !== null) must not be returned in lists.
 * - isOwnedBy() enforces anti-IDOR in use cases.
 * - Limit: a doctor may have at most MAX_FILES_PER_DOCTOR active (non-deleted) files.
 */
export interface DoctorDocumentFileCreateParams {
  id: string;
  doctorId: string;
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class DoctorDocumentFile {
  static readonly MAX_NAME_LENGTH = 120;
  static readonly MAX_FILES_PER_DOCTOR = 50;
  static readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ] as const;

  readonly id: string;
  readonly doctorId: string;
  readonly name: string;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(params: DoctorDocumentFileCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.name = params.name;
    this.storagePath = params.storagePath;
    this.mimeType = params.mimeType;
    this.sizeBytes = params.sizeBytes;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.deletedAt = params.deletedAt;
  }

  /** Returns true when the given doctor owns this file. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Returns true when the file has been soft-deleted. */
  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  static create(params: DoctorDocumentFileCreateParams): DoctorDocumentFile {
    return new DoctorDocumentFile(params);
  }
}
