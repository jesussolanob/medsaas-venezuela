import { z } from 'zod';

export type RateSource = 'binance' | 'bcv' | 'manual';

/**
 * DTO for POST /api/admin/settings/rate-source
 *
 * Selects the active rate source.
 * When source='manual', `value` is required and must be > 0.
 * For 'binance' / 'bcv', `value` is ignored.
 */
export const SetRateSourceDtoSchema = z
  .object({
    source: z.enum(['binance', 'bcv', 'manual']),
    /** Rate value in BS per USD. Required only when source='manual'. */
    value: z.number().positive({ message: 'La tasa debe ser mayor a cero' }).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.source === 'manual' && data.value == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'La tasa es requerida cuando la fuente es manual',
      });
    }
  });

export type SetRateSourceDto = z.infer<typeof SetRateSourceDtoSchema>;
