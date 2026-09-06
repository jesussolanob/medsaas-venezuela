import { z } from 'zod';

// ---------------------------------------------------------------------------
// Business-level upper bounds
// Chosen to be safely below NUMERIC(12,2) overflow even when multiplied
// together (e.g. MAX_QTY × MAX_PRICE < 10^10).
// ---------------------------------------------------------------------------
const MAX_PRICE = 9_999_999; // US$ ~10M — covers any realistic medical product
const MAX_STOCK = 999_999; // 1M units — covers any realistic inventory count
const MAX_QTY = 9_999; // units per transaction / movement line

// ---------------------------------------------------------------------------
// Product DTOs
// ---------------------------------------------------------------------------

export const CreateProductDtoSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').max(200),
    description: z.string().max(1000).default(''),
    supplier: z.string().max(200).optional(),
    sale_price_amount: z
      .number()
      .nonnegative('El precio debe ser mayor o igual a cero')
      .max(MAX_PRICE, `El precio no puede superar ${MAX_PRICE}`)
      .finite(),
    sale_price_currency: z.enum(['USD', 'VES']),
    stock_qty: z
      .number()
      .finite()
      .min(-MAX_STOCK, `El stock no puede ser menor a -${MAX_STOCK}`)
      .max(MAX_STOCK, `El stock no puede superar ${MAX_STOCK}`)
      .default(0),
    low_stock_threshold: z.number().nonnegative().finite().max(MAX_STOCK).optional(),
    photo_path: z.string().optional(),
  })
  .strict();

export type CreateProductDto = z.infer<typeof CreateProductDtoSchema>;

export const UpdateProductDtoSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    supplier: z.string().max(200).optional().nullable(),
    sale_price_amount: z.number().nonnegative().finite().max(MAX_PRICE).optional(),
    sale_price_currency: z.enum(['USD', 'VES']).optional(),
    low_stock_threshold: z.number().nonnegative().finite().max(MAX_STOCK).optional().nullable(),
    photo_path: z.string().optional().nullable(),
  })
  .strict();

export type UpdateProductDto = z.infer<typeof UpdateProductDtoSchema>;

export const ListProductsQuerySchema = z
  .object({
    search: z.string().optional(),
    active: z
      .string()
      .optional()
      .transform((v) => {
        if (v === 'true') return true;
        if (v === 'false') return false;
        return undefined;
      }),
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

export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;

// ---------------------------------------------------------------------------
// Movement DTOs
// ---------------------------------------------------------------------------

/**
 * Manual movement kinds exposed to the API.
 * 'sale' is intentionally excluded — it is created automatically during consultation
 * approval and must never be sent by a client. Using a distinct name prevents
 * accidental import of the broader domain MovementKind which includes 'sale'.
 */
export const ManualMovementKindSchema = z.enum(['purchase', 'adjustment', 'loss']);
export type ManualMovementKind = z.infer<typeof ManualMovementKindSchema>;

export const RegisterMovementDtoSchema = z
  .object({
    kind: ManualMovementKindSchema,
    qty: z
      .number()
      .finite()
      .min(-MAX_QTY, `La cantidad no puede ser menor a -${MAX_QTY}`)
      .max(MAX_QTY, `La cantidad no puede superar ${MAX_QTY}`)
      .refine((v) => v !== 0, { message: 'La cantidad no puede ser cero' }),
    note: z.string().max(500).optional(),
  })
  .strict();

export type RegisterMovementDto = z.infer<typeof RegisterMovementDtoSchema>;

// ---------------------------------------------------------------------------
// Bulk purchase (multi-product stock entry)
// ---------------------------------------------------------------------------

export const BulkPurchaseItemSchema = z
  .object({
    product_id: z.string().uuid('product_id debe ser un UUID válido'),
    qty: z
      .number()
      .positive('La cantidad debe ser positiva')
      .max(MAX_QTY, `La cantidad no puede superar ${MAX_QTY}`)
      .finite(),
    unit_price_usd: z.number().nonnegative().finite().max(MAX_PRICE).optional(),
  })
  .strict();

export type BulkPurchaseItem = z.infer<typeof BulkPurchaseItemSchema>;

export const BulkPurchaseDtoSchema = z
  .object({
    items: z
      .array(BulkPurchaseItemSchema)
      .min(1, 'Debe incluir al menos un ítem')
      .max(200, 'El lote no puede superar 200 ítems'),
    note: z.string().max(500).optional(),
  })
  .strict();

export type BulkPurchaseDto = z.infer<typeof BulkPurchaseDtoSchema>;

// ---------------------------------------------------------------------------
// Product extras for consultation payment approval (inventory-linked)
// ---------------------------------------------------------------------------

export const ProductExtraItemSchema = z
  .object({
    product_id: z.string().uuid('product_id debe ser un UUID válido'),
    quantity: z
      .number()
      .positive('La cantidad debe ser mayor a cero')
      .max(MAX_QTY, `La cantidad no puede superar ${MAX_QTY}`)
      .finite(),
  })
  .strict();

export type ProductExtraItem = z.infer<typeof ProductExtraItemSchema>;
