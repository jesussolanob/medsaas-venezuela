import { z } from 'zod';

export const CreatePricingPlanDtoSchema = z
  .object({
    name: z.string().min(1).max(200),
    price_usd: z.number().nonnegative(),
    duration_minutes: z.number().int().positive().default(30),
    sessions_count: z.number().int().positive().default(1),
    description: z.string().nullable().optional(),
    type: z.enum(['plan', 'service']).default('plan'),
    show_in_booking: z.boolean().default(true),
    /**
     * FK → doctor_offices(id). Optional.
     * When provided, the use case validates that the office belongs to the
     * authenticated doctor (anti-IDOR).
     * null / absent = general plan (usable at all offices — backward compat).
     */
    office_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreatePricingPlanDto = z.infer<typeof CreatePricingPlanDtoSchema>;
