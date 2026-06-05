import { z } from 'zod';

export const UpdateDoctorExchangeRateDtoSchema = z
  .object({
    /**
     * Rate mode:
     *   'usd_bcv'  — use the global admin-configured USDT/BS rate (USD source)
     *   'eur_bcv'  — use a EUR→Bs rate (not yet auto-fetched; doctor can approximate)
     *   'custom'   — doctor sets their own rate in custom_rate
     */
    mode: z.enum(['usd_bcv', 'eur_bcv', 'custom']),
    /** Rate value (Bs per 1 USD/EUR). Required when mode='custom'. */
    custom_rate: z.number().positive().nullable().optional(),
    /** Human-readable label for the custom rate (max 60 chars). */
    custom_rate_label: z.string().max(60).nullable().optional(),
  })
  .strict();

export type UpdateDoctorExchangeRateDto = z.infer<typeof UpdateDoctorExchangeRateDtoSchema>;
