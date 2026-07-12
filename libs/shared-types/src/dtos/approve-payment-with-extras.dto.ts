import { z } from 'zod';

/**
 * Schema for a single extra service item attached to a consultation payment.
 *
 * - description: human-readable label shown on the receipt (e.g. "Limpieza dental")
 * - amount_usd: positive monetary amount; must be > 0 to prevent zero-value noise rows
 */
export const ConsultationExtraItemSchema = z
  .object({
    description: z.string().min(1, 'La descripción es requerida').max(500),
    amount_usd: z.number().positive('amount_usd debe ser mayor a cero').finite(),
  })
  .strict();

export type ConsultationExtraItem = z.infer<typeof ConsultationExtraItemSchema>;

/**
 * DTO for approving a consultation payment with optional extra service items.
 *
 * Replaces the old ApprovePaymentDtoSchema for the PATCH :id/approve-payment endpoint.
 *
 * - extras: list of additional services performed (e.g. lab tests, procedures).
 *   Defaults to an empty array → no extras, base price only.
 * - method: payment method string (e.g. "zelle", "pago_movil").
 *   Optional — doctor may set it later via update-payment-details.
 */
export const ApprovePaymentWithExtrasDtoSchema = z
  .object({
    extras: z.array(ConsultationExtraItemSchema).default([]),
    method: z.string().min(1).max(100).optional(),
  })
  .strict();

export type ApprovePaymentWithExtrasDto = z.infer<typeof ApprovePaymentWithExtrasDtoSchema>;
