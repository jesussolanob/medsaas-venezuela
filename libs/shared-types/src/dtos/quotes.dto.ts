import { z } from 'zod';
import { cedulaSchema } from '../common';

// ---------------------------------------------------------------------------
// Enums / value-object schemas
// ---------------------------------------------------------------------------

export const QuoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const QuoteItemKindSchema = z.enum(['service', 'product', 'manual']);
export type QuoteItemKind = z.infer<typeof QuoteItemKindSchema>;

/**
 * 'amount'  → discount_value is a flat USD amount (e.g. 30 = $30).
 * 'percent' → discount_value is a percentage of the subtotal (e.g. 30 = 30%).
 */
export const QuoteDiscountTypeSchema = z.enum(['amount', 'percent']);
export type QuoteDiscountType = z.infer<typeof QuoteDiscountTypeSchema>;

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
    /**
     * Source id: pricing_plan.id for services, product.id for products.
     * 'manual' items have NO catalog entry — source_id must be null/absent for
     * them (enforced below). For 'service'/'product' it stays optional.
     */
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
  })
  .refine((it) => it.kind !== 'manual' || !it.source_id, {
    message: 'Un ítem manual no puede tener un source_id — no viene de ningún catálogo',
    path: ['source_id'],
  });

export type QuoteItemInput = z.infer<typeof QuoteItemInputSchema>;

// ---------------------------------------------------------------------------
// New recipient (quote for someone who is not yet a patient)
// ---------------------------------------------------------------------------

/**
 * Data for a recipient who does not exist yet as a patient nor a lead.
 *
 * The backend resolves this to a patient_id: if a patient with this cédula
 * already exists for the doctor, that patient is REUSED (never duplicated —
 * a specialist quoting someone they forgot they already had on file must not
 * split that person's clinical history in two). Otherwise a new patient is
 * created through the same encrypted-PII path as the Patients module.
 *
 * cedula is required — it is the only reliable identity key to dedupe against
 * an existing patient. phone is required (the specialist's contact channel
 * for follow-up); email stays optional, matching lead creation today.
 */
export const QuoteNewRecipientSchema = z
  .object({
    first_name: z.string().trim().min(1, 'El nombre es requerido').max(200),
    last_name: z.string().trim().min(1, 'El apellido es requerido').max(200),
    email: z.string().trim().email('El correo no es válido').max(300).optional().nullable(),
    phone: z.string().trim().min(1, 'El teléfono es requerido').max(50),
    cedula: cedulaSchema,
  })
  .strict();

export type QuoteNewRecipient = z.infer<typeof QuoteNewRecipientSchema>;

// ---------------------------------------------------------------------------
// Create quote
// ---------------------------------------------------------------------------

export const CreateQuoteDtoSchema = z
  .object({
    /**
     * Exactly one of patient_id / lead_id / new_recipient must be set.
     * Validated in CreateQuoteUseCase (QuoteInvalidRecipientError) — not here,
     * so the domain layer owns the invariant and the error message stays
     * consistent with the update/XOR checks already living there.
     */
    patient_id: z.string().uuid().optional().nullable(),
    lead_id: z.string().uuid().optional().nullable(),
    new_recipient: QuoteNewRecipientSchema.optional().nullable(),
    valid_until: z.string().date().optional().nullable(),
    notes: z.string().max(5000).default(''),
    discount_type: QuoteDiscountTypeSchema.default('amount'),
    /**
     * What the specialist typed — 30 = $30 for 'amount', 30 = 30% for 'percent'.
     * discount_usd (the computed dollar result) is NEVER accepted from the
     * client — the backend always derives it from these two fields.
     */
    discount_value: z
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
  .refine((dto) => dto.discount_type !== 'percent' || dto.discount_value <= 100, {
    message: 'Un descuento por porcentaje no puede superar el 100%',
    path: ['discount_value'],
  })
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
    discount_type: QuoteDiscountTypeSchema.optional(),
    discount_value: z.number().nonnegative().max(MAX_PRICE).finite().optional(),
    items: z.array(QuoteItemInputSchema).min(1).max(MAX_ITEMS).optional(),
  })
  .strict()
  .refine((dto) => dto.discount_type !== 'percent' || (dto.discount_value ?? 0) <= 100, {
    message: 'Un descuento por porcentaje no puede superar el 100%',
    path: ['discount_value'],
  });

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
// Public quote status update (recipient accepts/rejects via the share link)
// ---------------------------------------------------------------------------

/**
 * Status update submitted from the unauthenticated public quote view.
 * Deliberately excludes 'expired' — only the specialist decides that; the
 * recipient can only accept or reject the quote they were sent.
 */
export const PublicQuoteStatusDtoSchema = z
  .object({
    status: z.enum(['accepted', 'rejected']),
  })
  .strict();

export type PublicQuoteStatusDto = z.infer<typeof PublicQuoteStatusDtoSchema>;

// ---------------------------------------------------------------------------
// List quotes query
// ---------------------------------------------------------------------------

export const ListQuotesQuerySchema = z
  .object({
    status: QuoteStatusSchema.optional(),
    patient_name: z.string().max(200).optional(),
    product_name: z.string().max(200).optional(),
    /**
     * Free-text filter on the supplier field of the linked product.
     * Only finds quotes whose items still reference an active product with a
     * matching supplier — see QuoteListFilters.supplier for the caveat.
     */
    supplier: z.string().max(200).optional(),
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
