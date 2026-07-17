import { z } from 'zod';

/**
 * DTO for creating a prescription.
 * doctor_id is never accepted from the body — it comes from the auth token.
 *
 * NOTE: the DB column is `medication` (not `medication_name`). The plan doc
 * was outdated — real schema (T-09 in 03b-schema-real.md) uses `medication`.
 */
export const CreatePrescriptionDtoSchema = z.object({
  // patient_id is nullable in DB (T-09 real schema) — optional at the API level too.
  patient_id: z.string().uuid().nullable().optional(),
  consultation_id: z.string().uuid().nullable().optional(),
  medication: z.string().min(1),
  dosage: z.string().min(1).nullable().optional(),
  frequency: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Pharmaceutical form (e.g. 'tabletas', 'gotas', 'spray', 'cápsulas').
  // Empty strings AND null are normalised to undefined so the DB stores NULL.
  // (The BFF sends `presentation: null` when the doctor leaves it blank — e.g.
  // every paraclínico exam and any récipe row without a presentation. Without
  // coercing null→undefined here, Zod rejected the whole request with
  // "expected string, received null" → prescriptions never saved.)
  presentation: z
    .preprocess(
      (v) => (v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
      z.string().trim().max(80).optional(),
    )
    .optional(),
});

export type CreatePrescriptionDto = z.infer<typeof CreatePrescriptionDtoSchema>;
