import { z } from 'zod';

// ---------------------------------------------------------------------------
// Admin DTOs
// ---------------------------------------------------------------------------

/**
 * Input DTO for creating a release note (creates a draft).
 */
export const CreateReleaseNoteDtoSchema = z.object({
  title: z
    .string()
    .min(1, 'El título es obligatorio.')
    .max(80, 'El título no puede superar 80 caracteres.'),
  body: z
    .string()
    .min(1, 'El cuerpo es obligatorio.')
    .max(1500, 'El cuerpo no puede superar 1500 caracteres.'),
  imageUrl: z.string().url('La URL de la imagen no es válida.').nullable().optional(),
  audiencePlans: z.array(z.string().min(1)).nullable().optional(),
});
export type CreateReleaseNoteDto = z.infer<typeof CreateReleaseNoteDtoSchema>;

/**
 * Input DTO for updating a release note (partial, works on draft or published).
 */
export const UpdateReleaseNoteDtoSchema = z.object({
  title: z
    .string()
    .min(1, 'El título es obligatorio.')
    .max(80, 'El título no puede superar 80 caracteres.')
    .optional(),
  body: z
    .string()
    .min(1, 'El cuerpo es obligatorio.')
    .max(1500, 'El cuerpo no puede superar 1500 caracteres.')
    .optional(),
  imageUrl: z.string().url('La URL de la imagen no es válida.').nullable().optional(),
  audiencePlans: z.array(z.string().min(1)).nullable().optional(),
});
export type UpdateReleaseNoteDto = z.infer<typeof UpdateReleaseNoteDtoSchema>;

/**
 * Query params DTO for listing release notes (admin).
 */
export const ListReleaseNotesQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListReleaseNotesQuery = z.infer<typeof ListReleaseNotesQuerySchema>;

// ---------------------------------------------------------------------------
// Doctor DTOs
// ---------------------------------------------------------------------------

/**
 * Output item shape for release notes served to doctors.
 */
export const ReleaseNoteItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  publishedAt: z.string().datetime(),
});
export type ReleaseNoteItem = z.infer<typeof ReleaseNoteItemSchema>;
