import { z } from 'zod';
import { PaymentMethodSchema } from '../payment-method';

/**
 * DTO for POST /api/doctor/payments — register a new consultation payment.
 *
 * doctor_id is NOT included — always taken from authenticated user (anti-IDOR).
 * Ownership of the consultation is verified in the use case.
 */
export const RegisterPaymentDtoSchema = z
  .object({
    consultation_id: z.string().uuid({ message: 'La consulta indicada no es válida' }),
    patient_id: z.string().uuid({ message: 'El paciente indicado no es válido' }),
    amount: z.number().positive({ message: 'El monto debe ser mayor a cero' }),
    currency: z.string().min(1).max(10).default('USD'),
    payment_method: PaymentMethodSchema,
    reference_number: z.string().max(200).nullable().optional(),
    receipt_url: z.string().url().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type RegisterPaymentDto = z.infer<typeof RegisterPaymentDtoSchema>;

/**
 * DTO for PUT /api/doctor/payments/:id/reject — optionally attach rejection notes.
 */
export const RejectPaymentDtoSchema = z
  .object({
    notes: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type RejectPaymentDto = z.infer<typeof RejectPaymentDtoSchema>;
