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
    paid_at: z
      .string()
      .datetime({ error: 'La fecha de pago no tiene un formato válido' })
      .nullable()
      .optional(),
    method: z
      .string()
      .min(1, { error: 'El método de pago no puede estar vacío' })
      .max(100, { error: 'El método de pago no puede superar los 100 caracteres' })
      .nullable()
      .optional(),
    reference: z
      .string()
      .min(1, { error: 'La referencia no puede estar vacía' })
      .max(200, { error: 'La referencia no puede superar los 200 caracteres' })
      .nullable()
      .optional(),
    bcv_rate: z
      .number()
      .positive({ error: 'La tasa BCV debe ser mayor a cero' })
      .nullable()
      .optional(),
    amount_bs: z
      .number()
      .nonnegative({ error: 'El monto en bolívares no puede ser negativo' })
      .nullable()
      .optional(),
  })
  .strict();

export type UpdatePaymentDetailsCobrosDto = z.infer<typeof UpdatePaymentDetailsCobrosSchema>;
