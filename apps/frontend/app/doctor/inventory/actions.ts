'use server';

/**
 * app/doctor/inventory/actions.ts
 *
 * Server Actions for the inventory module.
 * Thin-proxy to the NestJS inventory controller via the BFF api-client.
 *
 * Backend endpoints (doctorId resolved from auth headers — anti-IDOR):
 *   GET    /api/doctor/inventory/products?search=&active=&page=&limit=
 *   POST   /api/doctor/inventory/products
 *   GET    /api/doctor/inventory/products/:id
 *   PUT    /api/doctor/inventory/products/:id
 *   DELETE /api/doctor/inventory/products/:id  (soft)
 *   GET    /api/doctor/inventory/products/:id/movements
 *   POST   /api/doctor/inventory/products/:id/movements
 */

import { backendGet, backendPost, backendPut, backendDelete } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Domain types (matches backend Product / InventoryMovement entities)
// ---------------------------------------------------------------------------

export type PriceCurrency = 'USD' | 'VES';

export type MovementKind = 'purchase' | 'sale' | 'adjustment' | 'loss';

export interface ProductRow {
  id: string;
  doctor_id: string;
  name: string;
  description: string;
  supplier: string | null;
  /** Signed URL returned by the backend. Store photo_path (not this URL) when saving. */
  photo_url: string | null;
  photo_path: string | null;
  sale_price_amount: number;
  sale_price_currency: PriceCurrency;
  stock_qty: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MovementRow {
  id: string;
  doctor_id: string;
  product_id: string;
  kind: MovementKind;
  /** Positive = stock in, negative = stock out. */
  qty: number;
  unit_price_usd: number | null;
  rate_used: number | null;
  rate_source: string | null;
  consultation_id: string | null;
  note: string | null;
  created_at: string;
  /**
   * Non-null when this movement is a reversal counter-entry.
   * Points to the original movement that was reversed.
   * Use this to distinguish reversals from normal movements.
   */
  reverses_movement_id: string | null;
}

/**
 * Forma REAL del wire, verificada contra la respuesta del endpoint y contra
 * `Product` en apps/backend/.../domain/entities/product.entity.ts.
 *
 * ⚠️ El controlador de inventario devuelve la ENTIDAD tal cual (`data: product`),
 * sin ningún mapeador a snake_case. Por eso viaja en **camelCase**.
 *
 * Esto estaba declarado en snake_case y nada lo delataba: TypeScript da por buena
 * la anotación escrita a mano, así que `Number(p.sale_price_amount)` era
 * `Number(undefined)` = NaN y el catálogo mostraba "$NaN" en precio y stock. Los
 * tests, el typecheck y el build pasaban en verde.
 *
 * Si algún día se agrega un mapeador en el backend, este tipo se cambia con él.
 */
interface BackendProduct {
  id: string;
  doctorId: string;
  name: string;
  description: string;
  supplier: string | null;
  /** URL firmada que arma el backend al leer. Para guardar se manda photoPath. */
  photoUrl: string | null;
  photoPath: string | null;
  salePriceAmount: number | string;
  salePriceCurrency: string;
  stockQty: number | string;
  lowStockThreshold: number | string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BackendMovement {
  id: string;
  doctorId: string;
  productId: string;
  kind: string;
  qty: number | string;
  unitPriceUsd: number | string | null;
  rateUsed: number | string | null;
  rateSource: string | null;
  consultationId: string | null;
  note: string | null;
  createdAt: string;
  /**
   * Non-null when this movement is a reversal counter-entry.
   * Points to the original movement being reversed.
   */
  reversesMovementId: string | null;
}

/**
 * Traduce camelCase del wire a snake_case del frontend y fuerza los numéricos.
 *
 * `Number(undefined)` es NaN y NO explota: se pinta como "NaN" en pantalla. Por eso
 * un desajuste de nombres acá no rompe nada visible en tests ni en el build —
 * solo en la pantalla. Al cambiar un nombre, verificar contra la respuesta real.
 */
function toProductRow(p: BackendProduct): ProductRow {
  return {
    id: p.id,
    doctor_id: p.doctorId,
    name: p.name,
    description: p.description ?? '',
    supplier: p.supplier ?? null,
    photo_url: p.photoUrl ?? null,
    photo_path: p.photoPath ?? null,
    sale_price_amount: Number(p.salePriceAmount),
    sale_price_currency: (p.salePriceCurrency as PriceCurrency) ?? 'USD',
    stock_qty: Number(p.stockQty),
    low_stock_threshold:
      p.lowStockThreshold !== null && p.lowStockThreshold !== undefined
        ? Number(p.lowStockThreshold)
        : null,
    is_active: Boolean(p.isActive),
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function toMovementRow(m: BackendMovement): MovementRow {
  return {
    id: m.id,
    doctor_id: m.doctorId,
    product_id: m.productId,
    kind: m.kind as MovementKind,
    qty: Number(m.qty),
    unit_price_usd:
      m.unitPriceUsd !== null && m.unitPriceUsd !== undefined ? Number(m.unitPriceUsd) : null,
    rate_used: m.rateUsed !== null && m.rateUsed !== undefined ? Number(m.rateUsed) : null,
    rate_source: m.rateSource ?? null,
    consultation_id: m.consultationId ?? null,
    note: m.note ?? null,
    created_at: m.createdAt,
    reverses_movement_id: m.reversesMovementId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface GetProductsInput {
  search?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}

export interface ProductsResult {
  products: ProductRow[];
  total: number;
  error?: string;
}

/** List the authenticated doctor's products. */
export async function getProducts(input: GetProductsInput = {}): Promise<ProductsResult> {
  const params = new URLSearchParams();
  if (input.search) params.set('search', input.search);
  if (input.active !== undefined) params.set('active', String(input.active));
  if (input.page) params.set('page', String(input.page));
  if (input.limit) params.set('limit', String(input.limit));

  const qs = params.toString();
  const path = `/api/doctor/inventory/products${qs ? `?${qs}` : ''}`;

  const result = await backendGet<
    { products?: BackendProduct[]; total?: number } | BackendProduct[]
  >(path);
  if (!result.ok) return { products: [], total: 0, error: result.error.message };

  // Backend may return paged envelope { products, total } or a plain array.
  const value = result.value;
  if (Array.isArray(value)) {
    const rows = value.map(toProductRow);
    return { products: rows, total: rows.length };
  }
  const rows = Array.isArray(value?.products) ? value.products.map(toProductRow) : [];
  return { products: rows, total: value?.total ?? rows.length };
}

/** Get a single product by id. Returns null on not-found or permission error. */
export async function getProduct(id: string): Promise<ProductRow | null> {
  const result = await backendGet<BackendProduct>(`/api/doctor/inventory/products/${id}`);
  if (!result.ok) return null;
  return toProductRow(result.value);
}

// ---------------------------------------------------------------------------
// Create / Update / Deactivate
// ---------------------------------------------------------------------------

/**
 * ⚠️ ASIMETRÍA DEL MÓDULO, a propósito: se ESCRIBE en snake_case y se LEE en
 * camelCase.
 *
 * La entrada la valida un esquema Zod de `@delta/shared-types` que declara
 * `sale_price_amount` / `photo_path` y es `.strict()`: mandarlo en camelCase hace
 * fallar la petición. La salida, en cambio, es la entidad serializada tal cual,
 * en camelCase (ver BackendProduct arriba).
 *
 * NO "emparejar" los dos lados sin tocar el backend: cambiar estos nombres a
 * camelCase rompe el alta y la edición.
 */
export interface CreateProductInput {
  name: string;
  description?: string;
  supplier?: string;
  /** GCS path from the upload endpoint. Must start with product/<userId>/. */
  photo_path?: string;
  sale_price_amount: number;
  sale_price_currency: PriceCurrency;
  stock_qty?: number;
  low_stock_threshold?: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  supplier?: string;
  /** Pass null to clear the photo. */
  photo_path?: string | null;
  sale_price_amount?: number;
  sale_price_currency?: PriceCurrency;
  stock_qty?: number;
  low_stock_threshold?: number | null;
}

export interface ActionResult {
  error?: string;
  product?: ProductRow;
}

export async function createProduct(input: CreateProductInput): Promise<ActionResult> {
  const result = await backendPost<BackendProduct>('/api/doctor/inventory/products', input);
  if (!result.ok) return { error: result.error.message };
  return { product: toProductRow(result.value) };
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<ActionResult> {
  const result = await backendPut<BackendProduct>(`/api/doctor/inventory/products/${id}`, input);
  if (!result.ok) return { error: result.error.message };
  return { product: toProductRow(result.value) };
}

/** Soft-delete (deactivate) a product. Uses DELETE verb but backend never hard-deletes. */
export async function deactivateProduct(id: string): Promise<ActionResult> {
  const result = await backendDelete<BackendProduct>(`/api/doctor/inventory/products/${id}`);
  if (!result.ok) return { error: result.error.message };
  return {};
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

export interface GetMovementsInput {
  page?: number;
  limit?: number;
}

export interface MovementsResult {
  movements: MovementRow[];
  total: number;
  error?: string;
}

export async function getMovements(
  productId: string,
  input: GetMovementsInput = {},
): Promise<MovementsResult> {
  const params = new URLSearchParams();
  if (input.page) params.set('page', String(input.page));
  if (input.limit) params.set('limit', String(input.limit));

  const qs = params.toString();
  const path = `/api/doctor/inventory/products/${productId}/movements${qs ? `?${qs}` : ''}`;

  const result = await backendGet<
    { movements?: BackendMovement[]; total?: number } | BackendMovement[]
  >(path);
  if (!result.ok) return { movements: [], total: 0, error: result.error.message };

  const value = result.value;
  if (Array.isArray(value)) {
    const rows = value.map(toMovementRow);
    return { movements: rows, total: rows.length };
  }
  const rows = Array.isArray(value?.movements) ? value.movements.map(toMovementRow) : [];
  return { movements: rows, total: value?.total ?? rows.length };
}

export interface RegisterMovementInput {
  kind: 'purchase' | 'adjustment' | 'loss';
  qty: number;
  note?: string;
}

export interface RegisterMovementResult {
  error?: string;
  movement?: MovementRow;
}

export async function registerMovement(
  productId: string,
  input: RegisterMovementInput,
): Promise<RegisterMovementResult> {
  const result = await backendPost<BackendMovement>(
    `/api/doctor/inventory/products/${productId}/movements`,
    input,
  );
  if (!result.ok) return { error: result.error.message };
  return { movement: toMovementRow(result.value) };
}

// ---------------------------------------------------------------------------
// Reverse a movement
// ---------------------------------------------------------------------------

export interface ReverseMovementResult {
  error?: string;
  /** The counter-entry movement created by the reversal. */
  movement?: MovementRow;
}

/**
 * Reverses a manual movement by creating a counter-entry.
 *
 * Consultation-linked movements cannot be reversed here — the backend returns a
 * 422 with a Spanish message explaining how to correct them via billing.
 *
 * Route: POST /api/doctor/inventory/movements/:id/reverse (no body)
 */
export async function reverseMovement(movementId: string): Promise<ReverseMovementResult> {
  const result = await backendPost<BackendMovement>(
    `/api/doctor/inventory/movements/${movementId}/reverse`,
    {},
  );
  if (!result.ok) return { error: result.error.message };
  return { movement: toMovementRow(result.value) };
}

// ---------------------------------------------------------------------------
// Bulk stock load
// ---------------------------------------------------------------------------

export interface BulkStockItem {
  product_id: string;
  /** Positive qty. Maximum 200 items per batch. */
  qty: number;
  unit_price_usd?: number;
}

export interface BulkStockInput {
  items: BulkStockItem[];
  note?: string;
}

export interface BulkStockResult {
  error?: string;
  /** Number of purchase movements created. */
  count?: number;
}

/**
 * Creates one purchase movement per item in a single atomic transaction.
 * If any item fails, the whole batch rolls back.
 *
 * Route: POST /api/doctor/inventory/movements/bulk
 * Body: { items: [{ product_id, qty, unit_price_usd? }], note? }
 */
export async function bulkLoadStock(input: BulkStockInput): Promise<BulkStockResult> {
  const result = await backendPost<BackendMovement[]>(
    '/api/doctor/inventory/movements/bulk',
    input,
  );
  if (!result.ok) return { error: result.error.message };
  const count = Array.isArray(result.value) ? result.value.length : 0;
  return { count };
}
