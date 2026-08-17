import { z } from 'zod';

/**
 * DTO for PATCH /consultations/:id/payment-details.
 *
 * All fields are optional. Providing a field replaces its value; providing null
 * clears it. Omitting a field leaves it unchanged in the database.
 *
 * payment_status: transitions to 'approved' auto-record paymentDate.
 * payment_reference: free-text bank reference number or transfer ID (max 200 chars).
 * payment_receipt_url: URL or storage path pointing to the receipt file (max 500 chars).
 *
 * no_show_fee: when present and > 0, signals that the amount increase is due to a
 * no-show penalty. The backend will atomically update the linked payment row
 * (status → 'pending', amount_usd → new total) if one exists and is approved.
 * Must be combined with `amount` (the new total including the fee).
 */
export const UpdatePaymentDetailsDtoSchema = z
  .object({
    payment_status: z.enum(['pending', 'approved']).optional(),
    payment_method: z.string().min(1).max(100).nullable().optional(),
    payment_reference: z.string().min(1).max(200).nullable().optional(),
    payment_receipt_url: z.string().min(1).max(500).nullable().optional(),
    amount: z.number().nonnegative().nullable().optional(),
    /** Positive penalty amount. Triggers atomic payment-table sync when > 0. */
    no_show_fee: z.number().positive().optional(),
  })
  .strict();

export type UpdatePaymentDetailsDto = z.infer<typeof UpdatePaymentDetailsDtoSchema>;
