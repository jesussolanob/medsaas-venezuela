import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums / value-object schemas
// ---------------------------------------------------------------------------

export const QuoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const QuoteItemKindSchema = z.enum(['service', 'product']);
export type QuoteItemKind = z.infer<typeof QuoteItemKindSchema>;

// ---------------------------------------------------------------------------
// Business-level upper bounds (consistent with inventory.dto.ts)
// ---------------------------------------------------------------------------
const MAX_PRICE = 9_999_999;
const MAX_QTY = 9_999;
const MAX_ITEMS = 100;

/**
 * Maximum amount_usd per item: NUMERIC(12,2) → 9,999,999,999.99.
 * We use a conservative cap that keeps even MAX_ITEMS × amountUsd below the
 * column limit (100 × 99,980,001 ≈ 9.998B < 9.9999B).
 *
 * The per-item cap is quantity × price → MAX_QTY × MAX_PRICE = 99,980,001,
 * which is below the column ceiling, so the real constraint is on the subtotal.
 */
const MAX_COLUMN_NUMERIC12 = 9_999_999_999.99;

// ---------------------------------------------------------------------------
// Quote item DTO (used inside CreateQuoteDto and UpdateQuoteDto)
// ---------------------------------------------------------------------------

export const QuoteItemInputSchema = z
  .object({
    kind: QuoteItemKindSchema,
    /** Source id: pricing_plan.id for services, product.id for products. Optional/informational. */
    source_id: z.string().uuid().optional().nullable(),
    name: z.string().min(1, 'El nombre del ítem es requerido').max(300),
    description: z.string().max(1000).default(''),
    quantity: z.number().positive('La cantidad debe ser mayor a cero').max(MAX_QTY).finite(),
    unit_price_usd: z
      .number()
      .nonnegative('El precio unitario debe ser mayor o igual a cero')
      .max(MAX_PRICE)
      .finite(),
    sort_order: z.number().int().min(0).default(0),
  })
  .strict()
  .refine((it) => it.quantity * it.unit_price_usd <= MAX_COLUMN_NUMERIC12, {
    message: `El monto por ítem (cantidad × precio) supera el límite máximo permitido (${MAX_COLUMN_NUMERIC12.toLocaleString('es-VE')})`,
    path: ['unit_price_usd'],
  });

export type QuoteItemInput = z.infer<typeof QuoteItemInputSchema>;

// ---------------------------------------------------------------------------
// Create quote
// ---------------------------------------------------------------------------

export const CreateQuoteDtoSchema = z
  .object({
    /** Exactly one of patient_id / lead_id must be set. Validated in use case. */
    patient_id: z.string().uuid().optional().nullable(),
    lead_id: z.string().uuid().optional().nullable(),
    valid_until: z.string().date().optional().nullable(),
    notes: z.string().max(5000).default(''),
    discount_usd: z
      .number()
      .nonnegative('El descuento no puede ser negativo')
      .max(MAX_PRICE)
      .finite()
      .default(0),
    items: z
      .array(QuoteItemInputSchema)
      .min(1, 'Un presupuesto debe tener al menos un ítem')
      .max(MAX_ITEMS),
  })
  .strict()
  .refine(
    (dto) => {
      const subtotal = dto.items.reduce((sum, it) => sum + it.quantity * it.unit_price_usd, 0);
      return subtotal <= MAX_COLUMN_NUMERIC12;
    },
    {
      message: `El subtotal del presupuesto supera el límite máximo permitido (${MAX_COLUMN_NUMERIC12.toLocaleString('es-VE')})`,
      path: ['items'],
    },
  );

export type CreateQuoteDto = z.infer<typeof CreateQuoteDtoSchema>;

// ---------------------------------------------------------------------------
// Update quote (only draft quotes can be updated)
// ---------------------------------------------------------------------------

export const UpdateQuoteDtoSchema = z
  .object({
    patient_id: z.string().uuid().optional().nullable(),
    lead_id: z.string().uuid().optional().nullable(),
    valid_until: z.string().date().optional().nullable(),
    notes: z.string().max(5000).optional(),
    discount_usd: z.number().nonnegative().max(MAX_PRICE).finite().optional(),
    items: z.array(QuoteItemInputSchema).min(1).max(MAX_ITEMS).optional(),
  })
  .strict();

export type UpdateQuoteDto = z.infer<typeof UpdateQuoteDtoSchema>;

// ---------------------------------------------------------------------------
// Update quote status
// ---------------------------------------------------------------------------

export const UpdateQuoteStatusDtoSchema = z
  .object({
    status: z.enum(['accepted', 'rejected', 'expired']),
  })
  .strict();

export type UpdateQuoteStatusDto = z.infer<typeof UpdateQuoteStatusDtoSchema>;

// ---------------------------------------------------------------------------
// List quotes query
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Send quote
// ---------------------------------------------------------------------------

export const SendQuoteDtoSchema = z
  .object({
    /** Recipient email. If not provided the link is created but not emailed. */
    recipient_email: z.string().email().max(300).optional().nullable(),
    /** Display name for the email greeting. */
    recipient_name: z.string().max(300).optional().nullable(),
  })
  .strict();

export type SendQuoteDto = z.infer<typeof SendQuoteDtoSchema>;

// ---------------------------------------------------------------------------
// List quotes query
// ---------------------------------------------------------------------------

export const ListQuotesQuerySchema = z
  .object({
    status: QuoteStatusSchema.optional(),
    patient_name: z.string().max(200).optional(),
    product_name: z.string().max(200).optional(),
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  })
  .strict();

export type ListQuotesQuery = z.infer<typeof ListQuotesQuerySchema>;
