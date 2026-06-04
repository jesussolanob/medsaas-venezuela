import { z } from 'zod';

/**
 * Zod schemas for promotion DTOs.
 *
 * Kept in the module (not in shared-types) because promotions are an internal
 * admin-only resource with no frontend-consuming contract yet.
 */

export const CreatePromotionDtoSchema = z.object({
  plan_key: z.string().min(1),
  duration_months: z.number().int().min(1).default(3),
  original_price_usd: z.number().positive(),
  promo_price_usd: z.number().positive(),
  label: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  ends_at: z
    .string()
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .optional()
    .nullable(),
});

export type CreatePromotionDto = z.infer<typeof CreatePromotionDtoSchema>;

export const UpdatePromotionDtoSchema = z.object({
  plan_key: z.string().min(1).optional(),
  duration_months: z.number().int().min(1).optional(),
  original_price_usd: z.number().positive().optional(),
  promo_price_usd: z.number().positive().optional(),
  label: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  ends_at: z
    .string()
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .optional()
    .nullable(),
});

export type UpdatePromotionDto = z.infer<typeof UpdatePromotionDtoSchema>;
