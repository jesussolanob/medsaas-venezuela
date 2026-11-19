import { z } from 'zod';

// ---------------------------------------------------------------------------
// MIME types allowed for doctor document files
// ---------------------------------------------------------------------------

export const DOCTOR_DOCUMENT_FILE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type DoctorDocumentFileMimeType = (typeof DOCTOR_DOCUMENT_FILE_ALLOWED_MIME_TYPES)[number];

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export const CreateDoctorDocumentFileDtoSchema = z.object({
  /** Display name shown in the doctor's library. Trimmed. Max 120 chars. */
  name: z.string().trim().min(1).max(120),
  /**
   * Storage path returned by POST /api/storage/upload.
   * Must start with `document/<doctorId>/` — validated in the use case.
   */
  filePath: z.string().min(1),
  /** MIME type of the file. */
  mimeType: z.enum(DOCTOR_DOCUMENT_FILE_ALLOWED_MIME_TYPES),
  /** File size in bytes. Must be a positive integer. */
  sizeBytes: z.number().int().positive(),
});

export type CreateDoctorDocumentFileDto = z.infer<typeof CreateDoctorDocumentFileDtoSchema>;

export const RenameDoctorDocumentFileDtoSchema = z.object({
  /** New display name. Trimmed. Max 120 chars. */
  name: z.string().trim().min(1).max(120),
});

export type RenameDoctorDocumentFileDto = z.infer<typeof RenameDoctorDocumentFileDtoSchema>;

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/** Single item returned by GET /api/doctor/document-files */
export interface DoctorDocumentFileListItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string; // ISO 8601
}

/** Response from GET /api/doctor/document-files */
export interface DoctorDocumentFileListResponse {
  files: DoctorDocumentFileListItem[];
}

/** Response from POST /api/doctor/document-files */
export interface DoctorDocumentFileCreatedResponse {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Response from GET /api/doctor/document-files/:id/url */
export interface DoctorDocumentFileUrlResponse {
  url: string;
}

// ---------------------------------------------------------------------------
// Attachments in share request (used by both consultation and standalone share)
// ---------------------------------------------------------------------------

export const ShareAttachmentUploadDtoSchema = z.object({
  name: z.string().trim().min(1).max(255),
  filePath: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export type ShareAttachmentUploadDto = z.infer<typeof ShareAttachmentUploadDtoSchema>;

export const ShareAttachmentsInputDtoSchema = z.object({
  libraryFileIds: z.array(z.string().uuid()).optional().default([]),
  uploads: z.array(ShareAttachmentUploadDtoSchema).optional().default([]),
});

export type ShareAttachmentsInputDto = z.infer<typeof ShareAttachmentsInputDtoSchema>;

// ---------------------------------------------------------------------------
// Render data attachment (returned by GET /api/patient/documents/:token/render-data)
// ---------------------------------------------------------------------------

/** An attachment available for individual download in the patient-facing document view. */
export interface RenderDataAttachmentDto {
  /** Stable key for UI rendering (array index as string). */
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Signed URL with Content-Disposition: attachment, TTL 10 min. */
  url: string;
}
