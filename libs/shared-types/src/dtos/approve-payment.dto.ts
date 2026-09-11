import { z } from 'zod';
import { PaymentMethodSchema } from '../payment-method';

// DTO for approving a consultation payment (pending → approved).
export const ApprovePaymentDtoSchema = z
  .object({
    amount: z.number().nonnegative(),
    payment_method: PaymentMethodSchema,
    payment_date: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ApprovePaymentDto = z.infer<typeof ApprovePaymentDtoSchema>;
