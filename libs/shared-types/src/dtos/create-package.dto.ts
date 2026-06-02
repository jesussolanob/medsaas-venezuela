import { z } from 'zod';

export const CreatePackageDtoSchema = z
  .object({
    patient_id: z.string().uuid(),
    plan_name: z.string().min(1).max(200),
    total_sessions: z.number().int().positive(),
    purchased_amount_usd: z.number().positive().nullable().optional(),
    specialty: z.string().max(100).nullable().optional(),
  })
  .strict();

export type CreatePackageDto = z.infer<typeof CreatePackageDtoSchema>;
