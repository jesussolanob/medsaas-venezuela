import { z } from 'zod';

/**
 * Schema for a single block definition in blocks_structure.
 *
 * blocks_structure is opaque, frontend-managed metadata persisted as JSONB. The block
 * items arrive with inconsistent field naming depending on their source: the doctor's
 * resolved config comes in camelCase (contentType/sortOrder/sendToPatient) while the
 * add-block catalog uses snake_case (content_type/sort_order). The backend only stores
 * and returns this array verbatim, so it must NOT enforce the internal shape — it only
 * requires a stable `key` and preserves every other field via .passthrough() so the
 * round-trip is lossless. (.passthrough() on this item schema does NOT conflict with the
 * parent's .strict(), which only governs top-level keys.)
 */
const BlockDefinitionSchema = z
  .object({
    key: z.string(),
  })
  .passthrough();

// DTO for updating clinical fields on an existing consultation.
// All fields are optional — partial update semantics.
export const UpdateConsultationDtoSchema = z
  .object({
    chief_complaint: z.string().max(2000).nullable().optional(),
    diagnosis: z.string().max(2000).nullable().optional(),
    treatment: z.string().max(2000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    // Dynamic clinical block VALUES — key→value record (autosave payload).
    // ETAPA 2: cifrar blocks_snapshot (PHI) — diferido, igual que patient_messages.body
    blocks_snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
    // Per-consultation block STRUCTURE — array of block definitions (separate from values).
    // Stored in blocks_structure column, not in blocks_snapshot.
    blocks_structure: z.array(BlockDefinitionSchema).nullable().optional(),
  })
  .strict();

export type UpdateConsultationDto = z.infer<typeof UpdateConsultationDtoSchema>;
