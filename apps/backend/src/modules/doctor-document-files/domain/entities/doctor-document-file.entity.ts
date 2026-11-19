import { DoctorDocumentFileDataInvalidError } from '../errors/doctor-document-file-data-invalid.error';

/**
 * DoctorDocumentFile domain entity.
 *
 * Represents a reusable file (PDF or image) stored in the doctor's
 * "Documentos frecuentes" library. Doctors upload a file once and can
 * attach it to any consultation share without re-uploading.
 *
 * Business invariants (enforced by create()):
 * - name: 1–120 non-whitespace characters (trimmed).
 * - mimeType: must be one of the ALLOWED_MIME_TYPES.
 * - sizeBytes: must be a positive integer.
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
    // Invariant: name must be 1–120 non-whitespace characters.
    const trimmedName = params.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > DoctorDocumentFile.MAX_NAME_LENGTH) {
      throw new DoctorDocumentFileDataInvalidError(
        `El nombre del archivo debe tener entre 1 y ${DoctorDocumentFile.MAX_NAME_LENGTH} caracteres.`,
      );
    }

    // Invariant: mimeType must be in the allowed set.
    const allowedMimes: readonly string[] = DoctorDocumentFile.ALLOWED_MIME_TYPES;
    if (!allowedMimes.includes(params.mimeType)) {
      throw new DoctorDocumentFileDataInvalidError(
        'El tipo de archivo no está permitido (solo PDF, JPG, PNG o WEBP).',
      );
    }

    return new DoctorDocumentFile(params);
  }
}
