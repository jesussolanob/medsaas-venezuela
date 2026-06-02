import { z } from 'zod';

// Columns from CLAUDE.md: patient_id, consultation_id, doctor_id, diagnosis, treatment_plan
// Additional column observed in usage: created_at, updated_at

export const EhrRecordSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  consultation_id: z.string().uuid().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  diagnosis: z.string().nullable().optional(),
  // PHI: encrypt at rest (AES-256-GCM)
  treatment_plan: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export type EhrRecord = z.infer<typeof EhrRecordSchema>;

export const CreateEhrRecordSchema = EhrRecordSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreateEhrRecord = z.infer<typeof CreateEhrRecordSchema>;
