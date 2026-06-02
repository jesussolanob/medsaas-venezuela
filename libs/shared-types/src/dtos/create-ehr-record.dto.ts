import { z } from 'zod';

/**
 * DTO for creating an EHR record.
 * doctor_id is never accepted from the body — it comes from the auth token.
 */
export const CreateEhrRecordDtoSchema = z.object({
  patient_id: z.string().uuid(),
  consultation_id: z.string().uuid().nullable().optional(),
  diagnosis: z.string().min(1).nullable().optional(),
  treatment_plan: z.string().min(1).nullable().optional(),
});

export type CreateEhrRecordDto = z.infer<typeof CreateEhrRecordDtoSchema>;

export const UpdateEhrRecordDtoSchema = z.object({
  diagnosis: z.string().min(1).nullable().optional(),
  treatment_plan: z.string().min(1).nullable().optional(),
});

export type UpdateEhrRecordDto = z.infer<typeof UpdateEhrRecordDtoSchema>;
