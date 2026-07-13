import { z } from 'zod';

export const AttachPaymentReceiptDtoSchema = z
  .object({
    /** Publicly accessible URL of the uploaded payment receipt image/document. */
    receipt_url: z.string().url({ error: 'La URL del comprobante no es válida' }),
  })
  .strict();

export type AttachPaymentReceiptDto = z.infer<typeof AttachPaymentReceiptDtoSchema>;
