import { z } from 'zod';

/**
 * DTO for PUT /api/finances/payments/:id/status
 * Updates the status of a payment (pending ↔ approved).
 *
 * doctor_id is NEVER in the body — always from authenticated user (anti-IDOR).
 */
export const UpdatePaymentStatusDtoSchema = z
  .object({
    status: z.enum(['pending', 'approved'], { error: 'Estado de pago no válido' }),
  })
  .strict();

export type UpdatePaymentStatusDto = z.infer<typeof UpdatePaymentStatusDtoSchema>;

/**
 * DTO for POST /api/finances/payments/:id/items
 * Adds a line item to a payment.
 *
 * doctor_id is NEVER in the body — always from authenticated user (anti-IDOR).
 */
export const AddPaymentItemDtoSchema = z
  .object({
    name: z
      .string()
      .min(1, 'El nombre del ítem es obligatorio')
      .max(500, 'El nombre no puede superar los 500 caracteres'),
    amount_usd: z.number().positive('El monto debe ser mayor a cero'),
    source_type: z.string().max(50).nullable().optional(),
    source_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type AddPaymentItemDto = z.infer<typeof AddPaymentItemDtoSchema>;
