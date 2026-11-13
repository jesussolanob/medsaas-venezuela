import { z } from 'zod';

/**
 * DTOs for the retention-invites module (Phase 4 — retention plan).
 */

// ---------------------------------------------------------------------------
// Public — invite click tracking
// ---------------------------------------------------------------------------

/**
 * Body for POST /api/public/retention/click
 */
export const RecordInviteClickDtoSchema = z.object({
  t: z.string().min(1, 'Token requerido'),
});
export type RecordInviteClickDto = z.infer<typeof RecordInviteClickDtoSchema>;

// ---------------------------------------------------------------------------
// Admin — retention metrics
// ---------------------------------------------------------------------------

/**
 * Query params for GET /api/admin/retention/metrics
 */
export const RetentionMetricsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from debe ser una fecha YYYY-MM-DD')
    .transform((v) => v),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to debe ser una fecha YYYY-MM-DD')
    .transform((v) => v),
});
export type RetentionMetricsQuery = z.infer<typeof RetentionMetricsQuerySchema>;
