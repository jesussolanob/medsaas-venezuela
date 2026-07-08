import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const SharedFileCategorySchema = z.enum([
  'instruction',
  'file',
  'recipe',
  'lab_result',
  'image',
  'other',
  'comment',
]);

export const SharedFileStatusSchema = z.enum(['pending', 'completed', 'reviewed']);

// ---------------------------------------------------------------------------
// Doctor: create a shared file for a patient
// ---------------------------------------------------------------------------

export const CreateSharedFileDoctorSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  title: z.string().min(1, 'title is required').max(500, 'title must be at most 500 characters'),
  description: z.string().max(5000).nullable().optional(),
  category: SharedFileCategorySchema,
  filePath: z.string().max(1000).nullable().optional(),
  fileType: z.string().max(50).nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
});

export type CreateSharedFileDoctorDto = z.infer<typeof CreateSharedFileDoctorSchema>;

// ---------------------------------------------------------------------------
// Doctor: update a shared file
// ---------------------------------------------------------------------------

export const UpdateSharedFileSchema = z.object({
  title: z
    .string()
    .min(1, 'title cannot be empty')
    .max(500, 'title must be at most 500 characters')
    .optional(),
  description: z.string().max(5000).nullable().optional(),
  status: SharedFileStatusSchema.optional(),
});

export type UpdateSharedFileDto = z.infer<typeof UpdateSharedFileSchema>;

// ---------------------------------------------------------------------------
// Doctor: mark-read for a patient
// ---------------------------------------------------------------------------

export const MarkReadDoctorSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
});

export type MarkReadDoctorDto = z.infer<typeof MarkReadDoctorSchema>;

// ---------------------------------------------------------------------------
// Patient: create a reply / upload
// ---------------------------------------------------------------------------

export const CreateSharedFilePatientSchema = z.object({
  title: z.string().min(1, 'title is required').max(500, 'title must be at most 500 characters'),
  description: z.string().max(5000).nullable().optional(),
  category: SharedFileCategorySchema,
  filePath: z.string().max(1000).nullable().optional(),
  fileType: z.string().max(50).nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
});

export type CreateSharedFilePatientDto = z.infer<typeof CreateSharedFilePatientSchema>;
