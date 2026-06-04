import { z } from 'zod';

// ---------------------------------------------------------------------------
// Subscription Payments
// ---------------------------------------------------------------------------

export const RejectSubscriptionPaymentBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RejectSubscriptionPaymentBody = z.infer<typeof RejectSubscriptionPaymentBodySchema>;

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const CreateInvoiceBodySchema = z.object({
  doctor_id: z.string().uuid({ message: 'doctor_id must be a valid UUID' }),
  amount: z.number().positive({ message: 'amount must be positive' }),
  currency: z.string().length(3).optional().default('USD'),
  description: z.string().max(500).nullable().optional(),
});
export type CreateInvoiceBody = z.infer<typeof CreateInvoiceBodySchema>;

// ---------------------------------------------------------------------------
// Billing Documents
// ---------------------------------------------------------------------------

const BillingDocumentItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export const CreateBillingDocumentBodySchema = z.object({
  doc_type: z.string().min(1, { message: 'doc_type is required' }),
  total: z.number().nonnegative({ message: 'total must be >= 0' }),
  items: z.array(BillingDocumentItemSchema).default([]),
  subtotal: z.number().nonnegative().nullable().optional(),
  iva_amount: z.number().nonnegative().optional().default(0),
  igtf_amount: z.number().nonnegative().optional().default(0),
  bcv_rate: z.number().positive().nullable().optional(),
  total_bs: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  currency: z.string().length(3).optional().default('USD'),
  consultation_id: z.string().uuid().nullable().optional(),
  payment_id: z.string().uuid().nullable().optional(),
  patient_id: z.string().uuid().nullable().optional(),
});
export type CreateBillingDocumentBody = z.infer<typeof CreateBillingDocumentBodySchema>;
