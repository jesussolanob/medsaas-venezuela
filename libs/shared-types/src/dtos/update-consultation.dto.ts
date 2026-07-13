import { z } from 'zod';

/**
 * Schema for a single block definition in blocks_structure.
 *
 * Intentionally does NOT use .passthrough() because the parent schema uses .strict().
 * Extra properties sent by the client are stripped by Zod at parse time — this is safe
 * because the frontend only sends fields it controls and the backend does not rely on
 * unknown extra fields in block definitions.
 */
const BlockDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  content_type: z.string(),
  sort_order: z.number(),
  printable: z.boolean().optional(),
  send_to_patient: z.boolean().optional(),
});

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
