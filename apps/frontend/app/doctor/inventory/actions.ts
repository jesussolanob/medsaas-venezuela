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
}

interface BackendProduct {
  id: string;
  doctor_id: string;
  name: string;
  description: string;
  supplier: string | null;
  photo_url: string | null;
  photo_path: string | null;
  sale_price_amount: number | string;
  sale_price_currency: string;
  stock_qty: number | string;
  low_stock_threshold: number | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BackendMovement {
  id: string;
  doctor_id: string;
  product_id: string;
  kind: string;
  qty: number | string;
  unit_price_usd: number | string | null;
  rate_used: number | string | null;
  rate_source: string | null;
  consultation_id: string | null;
  note: string | null;
  created_at: string;
}

/** Coerce numeric strings from Sequelize/Postgres NUMERIC columns to JS numbers. */
function toProductRow(p: BackendProduct): ProductRow {
  return {
    id: p.id,
    doctor_id: p.doctor_id,
    name: p.name,
    description: p.description ?? '',
    supplier: p.supplier ?? null,
    photo_url: p.photo_url ?? null,
    photo_path: p.photo_path ?? null,
    sale_price_amount: Number(p.sale_price_amount),
    sale_price_currency: (p.sale_price_currency as PriceCurrency) ?? 'USD',
    stock_qty: Number(p.stock_qty),
    low_stock_threshold: p.low_stock_threshold !== null ? Number(p.low_stock_threshold) : null,
    is_active: Boolean(p.is_active),
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

function toMovementRow(m: BackendMovement): MovementRow {
  return {
    id: m.id,
    doctor_id: m.doctor_id,
    product_id: m.product_id,
    kind: m.kind as MovementKind,
    qty: Number(m.qty),
    unit_price_usd: m.unit_price_usd !== null ? Number(m.unit_price_usd) : null,
    rate_used: m.rate_used !== null ? Number(m.rate_used) : null,
    rate_source: m.rate_source ?? null,
    consultation_id: m.consultation_id ?? null,
    note: m.note ?? null,
    created_at: m.created_at,
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
