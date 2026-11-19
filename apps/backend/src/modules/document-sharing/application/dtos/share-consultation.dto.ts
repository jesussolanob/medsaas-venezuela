import { z } from 'zod';
import { DoctorDocumentFile } from '../../../doctor-document-files/domain/entities/doctor-document-file.entity';

/** Valid document type keys for the new unified sharing selection. */
export const DOC_TYPE_VALUES = ['recipe', 'paraclinical', 'history', 'rest', 'informe'] as const;
export type DocTypeValue = (typeof DOC_TYPE_VALUES)[number];

/**
 * Schema for the new unified doc selection.
 *
 * `types`            — document types the doctor chose to share.
 *                      Now allows empty array — a share is valid when types
 *                      is empty but at least one attachment is provided.
 * `informeBlockKeys` — block keys selected within the 'informe' type.
 *                      Optional; defaults to empty array.
 * `restContent`      — text of the medical rest (reposo), frozen at share time.
 *                      Optional and nullable — only present when 'rest' is in types.
 */
export const DocSelectionSchema = z.object({
  types: z.array(z.enum(DOC_TYPE_VALUES)),
  informeBlockKeys: z.array(z.string()).optional().default([]),
  restContent: z.string().nullable().optional(),
});

export type DocSelectionDto = z.infer<typeof DocSelectionSchema>;

/**
 * Schema for a single upload attachment provided at share time.
 *
 * `name`      — display name of the file.
 * `filePath`  — storage path returned by POST /api/storage/upload.
 *               Must start with `document/<doctorId>/` — validated in use case.
 * `mimeType`  — MIME type of the file.
 * `sizeBytes` — file size in bytes.
 */
const ATTACHMENT_MIME_TYPES = DoctorDocumentFile.ALLOWED_MIME_TYPES as unknown as [
  string,
  ...string[],
];

/** Max bytes per upload attachment (10 MB). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ShareAttachmentUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  filePath: z.string().min(1),
  /** Must be one of the allowed MIME types. */
  mimeType: z.enum(ATTACHMENT_MIME_TYPES),
  /** Declared file size; capped at 10 MB per file. */
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type ShareAttachmentUploadDto = z.infer<typeof ShareAttachmentUploadSchema>;

/**
 * Schema for the optional attachments block in a share request.
 *
 * `libraryFileIds` — IDs of files already in the doctor's library.
 *                    Server resolves storagePath from the library (never trusted from client).
 * `uploads`        — files uploaded for this specific share (not stored in library).
 */
export const ShareAttachmentsInputSchema = z.object({
  libraryFileIds: z.array(z.string().uuid()).optional().default([]),
  uploads: z.array(ShareAttachmentUploadSchema).optional().default([]),
});

export type ShareAttachmentsInputDto = z.infer<typeof ShareAttachmentsInputSchema>;

export const ShareConsultationDtoSchema = z
  .object({
    sections: z
      .object({
        report: z.boolean().optional().default(false),
        prescriptions: z.boolean().optional().default(false),
        ehr: z.boolean().optional().default(false),
      })
      .optional()
      .default({ report: false, prescriptions: false, ehr: false }),
    /**
     * New unified selection — present when the doctor uses the redesigned modal.
     * When present it is persisted alongside `sections` (which is kept for compat).
     */
    doc_selection: DocSelectionSchema.optional(),
    /**
     * Optional file attachments (library items and/or upload-only files).
     * Max 10 total, total size ≤ 25 MB — validated in use case.
     */
    attachments: ShareAttachmentsInputSchema.optional(),
  })
  .refine(
    (body) => {
      // Accept when at least one document type is selected.
      const hasDocSelection = (body.doc_selection?.types?.length ?? 0) > 0;
      if (hasDocSelection) return true;
      // Accept when at least one attachment is provided.
      const hasAttachments =
        (body.attachments?.libraryFileIds?.length ?? 0) > 0 ||
        (body.attachments?.uploads?.length ?? 0) > 0;
      if (hasAttachments) return true;
      // Backward-compat: require at least one legacy section to be true.
      return !!(body.sections?.report || body.sections?.prescriptions || body.sections?.ehr);
    },
    { message: 'Debe seleccionar al menos una sección o archivo adjunto para compartir' },
  );

export type ShareConsultationDto = z.infer<typeof ShareConsultationDtoSchema>;

// ---------------------------------------------------------------------------

export const VerifyCodeDtoSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código debe contener solo dígitos'),
  /**
   * The patient's cédula is required alongside the code.
   * Both must match for the session token to be issued.
   * Input is normalized server-side (see normalize-cedula utility in use case).
   */
  cedula: z
    .string()
    .trim()
    .min(5, 'La cédula debe tener al menos 5 caracteres')
    .max(30, 'La cédula no puede superar los 30 caracteres'),
});

export type VerifyCodeDto = z.infer<typeof VerifyCodeDtoSchema>;
