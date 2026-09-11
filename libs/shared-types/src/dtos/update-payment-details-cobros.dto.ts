import { z } from 'zod';
import { PaymentMethodSchema } from '../payment-method';

/**
 * DTO for PATCH /finances/payments/:id/details
 *
 * Edits financial detail fields on a payments row from the Cobros drawer.
 * All fields are optional; omitting a field leaves it unchanged.
 * Passing null clears the field.
 *
 * Fields:
 *   paid_at        — ISO date string for the payment date.
 *   method         — método de pago del vocabulario cerrado ('transferencia',
 *                    'efectivo'…), NO su etiqueta. Ver src/payment-method.ts.
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
    // Vocabulario cerrado: ver libs/shared-types/src/payment-method.ts
    method: PaymentMethodSchema.nullable().optional(),
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
