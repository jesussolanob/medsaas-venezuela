import { z } from 'zod';

/**
 * DTO for PATCH /finances/payments/:id/details
 *
 * Edits financial detail fields on a payments row from the Cobros drawer.
 * All fields are optional; omitting a field leaves it unchanged.
 * Passing null clears the field.
 *
 * Fields:
 *   paid_at        — ISO date string for the payment date.
 *   method         — payment method label (e.g. 'Transferencia', 'Efectivo').
 *   reference      — bank reference number or transfer ID (max 200 chars).
 *   bcv_rate       — USD/VES exchange rate at the time of payment.
 *   amount_bs      — equivalent amount in bolivares at the given rate.
 */
export const UpdatePaymentDetailsCobrosSchema = z
  .object({
    paid_at: z.string().datetime().nullable().optional(),
    method: z.string().min(1).max(100).nullable().optional(),
    reference: z.string().min(1).max(200).nullable().optional(),
    bcv_rate: z.number().positive().nullable().optional(),
    amount_bs: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export type UpdatePaymentDetailsCobrosDto = z.infer<typeof UpdatePaymentDetailsCobrosSchema>;
