import { z } from 'zod';

/**
 * DTO for POST /api/doctor/payments — register a new consultation payment.
 *
 * doctor_id is NOT included — always taken from authenticated user (anti-IDOR).
 * Ownership of the consultation is verified in the use case.
 */
export const RegisterPaymentDtoSchema = z
  .object({
    consultation_id: z.string().uuid({ message: 'consultation_id must be a valid UUID' }),
    patient_id: z.string().uuid({ message: 'patient_id must be a valid UUID' }),
    amount: z.number().positive({ message: 'Amount must be greater than zero' }),
    currency: z.string().min(1).max(10).default('USD'),
    payment_method: z.string().min(1).max(100),
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
