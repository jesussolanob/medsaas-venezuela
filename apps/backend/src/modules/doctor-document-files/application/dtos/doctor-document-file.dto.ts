import { z } from 'zod';
import { DoctorDocumentFile } from '../../domain/entities/doctor-document-file.entity';

const ALLOWED_MIME_TYPES = [...DoctorDocumentFile.ALLOWED_MIME_TYPES] as [string, ...string[]];

/** DTO for registering a new document in the library. */
export const CreateDoctorDocumentFileDtoSchema = z.object({
  /** Display name shown to the doctor in the library (1–120 chars). */
  name: z
    .string()
    .trim()
    .min(1, 'El nombre no puede estar vacío')
    .max(
      DoctorDocumentFile.MAX_NAME_LENGTH,
      `El nombre no puede superar ${DoctorDocumentFile.MAX_NAME_LENGTH} caracteres`,
    ),
  /**
   * Storage path returned by POST /api/storage/upload.
   * Must start with `document/<doctorId>/` (validated in use case, not Zod,
   * because doctorId comes from auth — not from the client body).
   */
  filePath: z.string().min(1, 'La ruta del archivo es requerida'),
  /** MIME type of the uploaded file. */
  mimeType: z.enum(ALLOWED_MIME_TYPES as [string, ...string[]]),
  /** File size in bytes (from the upload response). */
  sizeBytes: z
    .number()
    .int('El tamaño debe ser un número entero')
    .positive('El tamaño debe ser mayor que cero'),
});

export type CreateDoctorDocumentFileDto = z.infer<typeof CreateDoctorDocumentFileDtoSchema>;

/** DTO for renaming a document in the library. */
export const RenameDoctorDocumentFileDtoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre no puede estar vacío')
    .max(
      DoctorDocumentFile.MAX_NAME_LENGTH,
      `El nombre no puede superar ${DoctorDocumentFile.MAX_NAME_LENGTH} caracteres`,
    ),
});

export type RenameDoctorDocumentFileDto = z.infer<typeof RenameDoctorDocumentFileDtoSchema>;
