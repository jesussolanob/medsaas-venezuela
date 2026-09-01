import { z } from 'zod';

/**
 * Schema for a single extra service item attached to a consultation payment.
 *
 * - description: human-readable label shown on the receipt (e.g. "Limpieza dental")
 * - amount_usd: positive monetary amount; must be > 0 to prevent zero-value noise rows
 */
export const ConsultationExtraItemSchema = z
  .object({
    description: z.string().min(1, 'La descripción es requerida').max(500),
    amount_usd: z.number().positive('amount_usd debe ser mayor a cero').finite(),
  })
  .strict();

export type ConsultationExtraItem = z.infer<typeof ConsultationExtraItemSchema>;

/**
 * Schema for a product-inventory extra — links a catalog product to the payment.
 *
 * The backend resolves price and description from the products table; the client
 * only sends product_id + quantity. amount_usd is NEVER trusted from the client
 * for inventory lines.
 */
export const ProductExtraItemForApprovalSchema = z
  .object({
    product_id: z.string().uuid('product_id debe ser un UUID válido'),
    // Upper bound matches MAX_QTY in inventory.dto.ts (9_999 units).
    // Prevents NUMERIC(12,2) overflow when multiplied by a large price.
    quantity: z.number().positive('La cantidad debe ser mayor a cero').max(9_999).finite(),
  })
  .strict();

export type ProductExtraItemForApproval = z.infer<typeof ProductExtraItemForApprovalSchema>;

/**
 * DTO for approving a consultation payment with optional extra service items.
 *
 * Replaces the old ApprovePaymentDtoSchema for the PATCH :id/approve-payment endpoint.
 *
 * - extras: list of additional free-text services performed (e.g. lab tests).
 *   Defaults to an empty array → no extras, base price only.
 * - product_extras: list of inventory-catalog products sold in this consultation.
 *   Prices are resolved by the backend; never send amount_usd for these.
 * - method: payment method string (e.g. "zelle", "pago_movil").
 *   Optional — doctor may set it later via update-payment-details.
 */
export const ApprovePaymentWithExtrasDtoSchema = z
  .object({
    extras: z.array(ConsultationExtraItemSchema).default([]),
    product_extras: z.array(ProductExtraItemForApprovalSchema).default([]),
    method: z.string().min(1).max(100).optional(),
  })
  .strict();

export type ApprovePaymentWithExtrasDto = z.infer<typeof ApprovePaymentWithExtrasDtoSchema>;
