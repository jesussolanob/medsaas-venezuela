import { z } from 'zod';

// DTO for updating clinical fields on an existing consultation.
// All fields are optional — partial update semantics.
export const UpdateConsultationDtoSchema = z
  .object({
    chief_complaint: z.string().max(2000).nullable().optional(),
    diagnosis: z.string().max(2000).nullable().optional(),
    treatment: z.string().max(2000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    // Dynamic clinical blocks from the doctor's consultation template.
    // ETAPA 2: cifrar blocks_snapshot (PHI) — diferido, igual que patient_messages.body
    blocks_snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export type UpdateConsultationDto = z.infer<typeof UpdateConsultationDtoSchema>;
