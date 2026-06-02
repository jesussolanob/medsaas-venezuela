import { z } from 'zod';

export const UpdatePricingPlanDtoSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    price_usd: z.number().nonnegative().optional(),
    duration_minutes: z.number().int().positive().optional(),
    sessions_count: z.number().int().positive().optional(),
    description: z.string().nullable().optional(),
    type: z.enum(['plan', 'service']).optional(),
    show_in_booking: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export type UpdatePricingPlanDto = z.infer<typeof UpdatePricingPlanDtoSchema>;
