import { z } from 'zod';

/**
 * DTO for the POST /consultations request body.
 *
 * consultation_code is NOT included — it is generated server-side by the use case.
 * doctor_id is NOT included — it is always taken from the authenticated user (anti-IDOR).
 */
export const CreateConsultationBodyDtoSchema = z
  .object({
    patient_id: z.string().uuid(),
    appointment_id: z.string().uuid().nullable().optional(),
    consultation_date: z.string().datetime({ offset: true }),
    // PHI: encrypt at rest (AES-256-GCM)
    chief_complaint: z.string().max(2000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export type CreateConsultationBodyDto = z.infer<typeof CreateConsultationBodyDtoSchema>;
