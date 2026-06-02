import { z } from 'zod';

// DTO for approving a consultation payment (pending → approved).
export const ApprovePaymentDtoSchema = z
  .object({
    amount: z.number().nonnegative(),
    payment_method: z.string().min(1).max(100),
    payment_date: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ApprovePaymentDto = z.infer<typeof ApprovePaymentDtoSchema>;
