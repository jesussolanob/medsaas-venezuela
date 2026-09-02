'use server';

/**
 * app/doctor/quotes/actions.ts
 *
 * Server Actions for the Quotes (Cotizaciones) module.
 * Thin-proxy to the NestJS quotes controller via api-client.server.
 *
 * Backend endpoints (doctorId from auth headers — anti-IDOR):
 *   GET  /api/doctor/quotes               → paginated list
 *   POST /api/doctor/quotes               → create draft
 *   GET  /api/doctor/quotes/:id           → single quote
 *   PUT  /api/doctor/quotes/:id           → update draft
 *   DELETE /api/doctor/quotes/:id         → delete draft (204)
 *   POST /api/doctor/quotes/:id/send      → emit quote
 *   PUT  /api/doctor/quotes/:id/status    → mark accepted/rejected
 *   POST /api/doctor/leads                → create prospect lead
 *
 * IMPORTANT: NUMERIC columns come as JS numbers from the domain entity (the
 * repository coerces with parseFloat). No additional coercion needed here.
 */

import { backendGet, backendPost, backendPut, backendDelete } from '@/lib/api-client.server';
import { getDoctorServices } from '@/app/doctor/services/actions';
import type { DoctorService } from '@/app/doctor/services-shared';
import { getProducts } from '@/app/doctor/inventory/actions';
import type { ProductRow } from '@/app/doctor/inventory/actions';
import { getPatients } from '@/app/doctor/patients/actions';
import type { Patient } from '@/app/doctor/patients/actions';
import { getLeads } from '@/app/doctor/crm/actions';
import type { LeadRow } from '@/app/doctor/crm/actions';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type QuoteItemKind = 'service' | 'product';

/**
 * The backend returns Quote domain entity instances, serialized as camelCase.
 * Numeric fields (subtotalUsd, etc.) come as JS numbers — the repository
 * already coerces them via parseFloat.
 */
interface BackendQuote {
  id: string;
  doctorId: string;
  quoteNumber: string;
  patientId: string | null;
  leadId: string | null;
  status: QuoteStatus;
  /** ISO timestamp — extract date part for display (DATEONLY stored in PG). */
  validUntil: string | null;
  notes: string;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  bcvRate: number | null;
  totalBs: number | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: BackendQuoteItem[];
  /** 48-byte random token stored in quote_share_links. null until the quote is sent. */
  share_token: string | null;
  /** Full public URL (already assembled by backend). null until the quote is sent. */
  share_url: string | null;
  /**
   * Nombre del destinatario ya resuelto por el backend: el del paciente (que está
   * cifrado y solo su repositorio sabe descifrar) o el del prospecto en `leads`.
   * null si se borró después de emitir la cotización.
   */
  recipient_name: string | null;
}

interface BackendQuoteItem {
  id: string;
  quoteId: string;
  doctorId: string;
  kind: QuoteItemKind;
  sourceId: string | null;
  name: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  amountUsd: number;
  sortOrder: number;
}

/** Frontend-normalised quote row (snake_case for UI consistency with other modules). */
export interface QuoteRow {
  id: string;
  doctor_id: string;
  quote_number: string;
  patient_id: string | null;
  lead_id: string | null;
  status: QuoteStatus;
  /** YYYY-MM-DD extracted from the backend ISO timestamp, or null. */
  valid_until: string | null;
  notes: string;
  subtotal_usd: number;
  discount_usd: number;
  total_usd: number;
  bcv_rate: number | null;
  total_bs: number | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  items: QuoteItemRow[];
  /** 48-byte share token. null until the quote is sent. */
  share_token: string | null;
  /** Full public URL. null until the quote is sent. */
  share_url: string | null;
  /**
   * Nombre del destinatario resuelto por el backend (paciente o prospecto).
   * null si se borró después de emitir la cotización. Es PII: no loguear.
   */
  recipient_name: string | null;
}

export interface QuoteItemRow {
  id: string;
  quote_id: string;
  kind: QuoteItemKind;
  source_id: string | null;
  name: string;
  description: string;
  quantity: number;
  unit_price_usd: number;
  amount_usd: number;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Extract YYYY-MM-DD from a full ISO timestamp, handling nulls. */
function toDateString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.split('T')[0] ?? iso;
}

function toQuoteItemRow(i: BackendQuoteItem): QuoteItemRow {
  return {
    id: i.id,
    quote_id: i.quoteId,
    kind: i.kind,
    source_id: i.sourceId,
    name: i.name,
    description: i.description,
    quantity: Number(i.quantity),
    unit_price_usd: Number(i.unitPriceUsd),
    amount_usd: Number(i.amountUsd),
    sort_order: i.sortOrder,
  };
}

function toQuoteRow(q: BackendQuote): QuoteRow {
  return {
    id: q.id,
    doctor_id: q.doctorId,
    quote_number: q.quoteNumber,
    patient_id: q.patientId,
    lead_id: q.leadId,
    status: q.status,
    valid_until: toDateString(q.validUntil),
    notes: q.notes,
    subtotal_usd: Number(q.subtotalUsd),
    discount_usd: Number(q.discountUsd),
    total_usd: Number(q.totalUsd),
    bcv_rate: q.bcvRate !== null ? Number(q.bcvRate) : null,
    total_bs: q.totalBs !== null ? Number(q.totalBs) : null,
    sent_at: q.sentAt ?? null,
    created_at: q.createdAt,
    updated_at: q.updatedAt,
    items: (q.items ?? []).map(toQuoteItemRow),
    share_token: q.share_token ?? null,
    share_url: q.share_url ?? null,
    recipient_name: q.recipient_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface GetQuotesInput {
  status?: QuoteStatus;
  patient_name?: string;
  product_name?: string;
  /** Free-text filter on the supplier field of quote items. */
  supplier?: string;
  page?: number;
  limit?: number;
}

export interface QuotesResult {
  quotes: QuoteRow[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}

export async function getQuotes(input: GetQuotesInput = {}): Promise<QuotesResult> {
  const params = new URLSearchParams();
  if (input.status) params.set('status', input.status);
  if (input.patient_name) params.set('patient_name', input.patient_name);
  if (input.product_name) params.set('product_name', input.product_name);
  if (input.supplier) params.set('supplier', input.supplier);
  params.set('page', String(input.page ?? 1));
  params.set('limit', String(input.limit ?? 20));

  const path = `/api/doctor/quotes?${params.toString()}`;

  const result = await backendGet<{
    items?: BackendQuote[];
    data?: BackendQuote[];
    total?: number;
    page?: number;
    limit?: number;
  }>(path);

  if (!result.ok) {
    return { quotes: [], total: 0, page: 1, limit: 20, error: result.error.message };
  }

  const value = result.value as unknown;

  // The list endpoint returns { success, data, meta } — backendGet unwraps to `data`.
  // The backendGetPaged variant would preserve meta, but list uses backendGet which
  // unwraps the envelope returning just the data array. However, the backend returns
  // { success, data: Quote[], meta: { total, page, limit } }. backendGet returns data
  // directly — we lose meta. Use backendFetch to capture it.
  if (Array.isArray(value)) {
    const rows = value.map((q) => toQuoteRow(q as BackendQuote));
    return { quotes: rows, total: rows.length, page: input.page ?? 1, limit: input.limit ?? 20 };
  }

  // If it's an object with items or a nested structure
  const obj = value as Record<string, unknown>;
  const items = Array.isArray(obj?.items) ? obj.items : Array.isArray(obj?.data) ? obj.data : [];
  const rows = (items as BackendQuote[]).map(toQuoteRow);
  return {
    quotes: rows,
    total: (obj?.total as number) ?? rows.length,
    page: (obj?.page as number) ?? input.page ?? 1,
    limit: (obj?.limit as number) ?? input.limit ?? 20,
  };
}

export async function getQuote(id: string): Promise<QuoteRow | null> {
  const result = await backendGet<BackendQuote>(`/api/doctor/quotes/${id}`);
  if (!result.ok) return null;
  return toQuoteRow(result.value);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface QuoteItemInput {
  kind: QuoteItemKind;
  source_id?: string | null;
  name: string;
  description?: string;
  quantity: number;
  unit_price_usd: number;
  sort_order?: number;
}

export interface CreateQuoteInput {
  patient_id?: string | null;
  lead_id?: string | null;
  valid_until?: string | null;
  notes?: string;
  discount_usd?: number;
  items: QuoteItemInput[];
}

export interface QuoteActionResult {
  quote?: QuoteRow;
  error?: string;
}

export async function createQuote(input: CreateQuoteInput): Promise<QuoteActionResult> {
  const payload = {
    patient_id: input.patient_id ?? null,
    lead_id: input.lead_id ?? null,
    valid_until: input.valid_until ?? null,
    notes: input.notes ?? '',
    discount_usd: input.discount_usd ?? 0,
    items: input.items.map((it, i) => ({
      kind: it.kind,
      source_id: it.source_id ?? null,
      name: it.name,
      description: it.description ?? '',
      quantity: it.quantity,
      unit_price_usd: it.unit_price_usd,
      sort_order: it.sort_order ?? i,
    })),
  };

  const result = await backendPost<BackendQuote>('/api/doctor/quotes', payload);
  if (!result.ok) return { error: result.error.message };
  return { quote: toQuoteRow(result.value) };
}

// ---------------------------------------------------------------------------
// Update (draft only)
// ---------------------------------------------------------------------------

export interface UpdateQuoteInput {
  patient_id?: string | null;
  lead_id?: string | null;
  valid_until?: string | null;
  notes?: string;
  discount_usd?: number;
  items?: QuoteItemInput[];
}

export async function updateQuote(id: string, input: UpdateQuoteInput): Promise<QuoteActionResult> {
  const payload: Record<string, unknown> = {};
  if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
  if (input.lead_id !== undefined) payload.lead_id = input.lead_id;
  if (input.valid_until !== undefined) payload.valid_until = input.valid_until;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.discount_usd !== undefined) payload.discount_usd = input.discount_usd;
  if (input.items !== undefined) {
    payload.items = input.items.map((it, i) => ({
      kind: it.kind,
      source_id: it.source_id ?? null,
      name: it.name,
      description: it.description ?? '',
      quantity: it.quantity,
      unit_price_usd: it.unit_price_usd,
      sort_order: it.sort_order ?? i,
    }));
  }

  const result = await backendPut<BackendQuote>(`/api/doctor/quotes/${id}`, payload);
  if (!result.ok) return { error: result.error.message };
  return { quote: toQuoteRow(result.value) };
}

// ---------------------------------------------------------------------------
// Delete (draft only)
// ---------------------------------------------------------------------------

export async function deleteQuote(id: string): Promise<{ error?: string }> {
  const result = await backendDelete<undefined>(`/api/doctor/quotes/${id}`);
  if (!result.ok) return { error: result.error.message };
  return {};
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export interface SendQuoteInput {
  recipient_email?: string | null;
  recipient_name?: string | null;
}

export async function sendQuote(id: string, input: SendQuoteInput): Promise<QuoteActionResult> {
  const result = await backendPost<BackendQuote>(`/api/doctor/quotes/${id}/send`, input);
  if (!result.ok) return { error: result.error.message };
  return { quote: toQuoteRow(result.value) };
}

// ---------------------------------------------------------------------------
// Update status (accepted | rejected — for sent quotes)
// ---------------------------------------------------------------------------

export async function updateQuoteStatus(
  id: string,
  status: 'accepted' | 'rejected' | 'expired',
): Promise<QuoteActionResult> {
  const result = await backendPut<BackendQuote>(`/api/doctor/quotes/${id}/status`, { status });
  if (!result.ok) return { error: result.error.message };
  return { quote: toQuoteRow(result.value) };
}

// ---------------------------------------------------------------------------
// Create prospect lead (for new quote recipients who are not yet patients)
// ---------------------------------------------------------------------------

export interface CreateProspectInput {
  name: string;
  last_name: string;
  email: string;
  phone?: string;
  channel?: string;
}

export interface LeadActionResult {
  lead_id?: string;
  error?: string;
}

export async function createProspectLead(input: CreateProspectInput): Promise<LeadActionResult> {
  const result = await backendPost<{ id: string }>('/api/doctor/leads', {
    name: input.name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone ?? '',
    channel: 'web',
    stage: 'new',
    message: '',
  });
  if (!result.ok) return { error: result.error.message };
  return { lead_id: (result.value as { id: string }).id };
}

// ---------------------------------------------------------------------------
// Load options for the quote form (services, products, patients, leads)
// ---------------------------------------------------------------------------

export interface QuoteFormOptions {
  services: DoctorService[];
  products: ProductRow[];
  patients: Patient[];
  leads: LeadRow[];
  error?: string;
}

/**
 * Loads all the data needed to build a quote form.
 * Called on demand when the user opens the creation / edit modal.
 */
export async function getQuoteFormOptions(): Promise<QuoteFormOptions> {
  const [servicesResult, productsResult, patientsResult, leadsResult] = await Promise.allSettled([
    getDoctorServices(),
    getProducts({ active: true, limit: 100 }),
    getPatients(''),
    getLeads(),
  ]);

  return {
    services: servicesResult.status === 'fulfilled' ? servicesResult.value : [],
    products: productsResult.status === 'fulfilled' ? productsResult.value.products : [],
    patients: patientsResult.status === 'fulfilled' ? patientsResult.value : [],
    leads: leadsResult.status === 'fulfilled' ? leadsResult.value : [],
  };
}
