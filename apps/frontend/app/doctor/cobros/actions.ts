'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/cobros/actions.ts
 *
 * Server Actions for the cobros (payments collection) page.
 * ETAPA 1 — thin-proxy to NestJS backend endpoints.
 *
 * Backend endpoints used:
 *   GET   /api/doctor/services                        → active pricing plans / services
 *   GET   /api/doctor/profile                         → doctor profile for receipt generation
 *   GET   /api/finances/payments                      → export: payments with date filter
 *   PATCH /api/finances/payments/:id/details          → update paid_at, method, reference, bcv_rate, amount_bs
 *   GET   /api/settings/bcv-rate?date=YYYY-MM-DD      → BCV rate for a specific date
 */

import { log } from '@/lib/logger';
import { backendGet, backendPatch } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pricing plan / service shape for the "Add item to payment" modal */
export type ServiceForModal = {
  id: string;
  name: string;
  price_usd: number;
  type: 'plan' | 'service';
};

/** Doctor profile shape needed for generating a PDF receipt */
export type DoctorProfileForReceipt = {
  full_name: string;
  professional_title: string | null;
  specialty: string | null;
  license_number: string | null;
  email: string;
  phone: string | null;
  logo_url: string | null;
  signature_url: string | null;
};

/** Payment row shape for CSV export (subset of the full payments response) */
export type PaymentExportRow = {
  scheduled_at: string;
  patient_name: string;
  plan_name: string | null;
  amount_usd: number;
  payment_method: string | null;
  status: string;
  appointment_code: string | null;
  consultation_code: string | null;
};

// ---------------------------------------------------------------------------
// Receipt / comprobante URL persistence
// ---------------------------------------------------------------------------

/** Result shape for mutation actions. */
export interface ReceiptActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Persist receipt_url on a payment record after the file has been uploaded to
 * MinIO via /api/storage/upload.
 *
 * Backend: PATCH /api/finances/payments/:paymentId/receipt
 *   body: { receipt_url }
 *
 * Note: The cobros page identifies rows by the `payments.id` field (backfilled
 * from getPayments()). This is the correct id for this endpoint.
 *
 * Replaces: supabase.from('appointments').update({ payment_receipt_url })
 */
export async function saveReceiptUrl(
  paymentId: string,
  receiptUrl: string,
): Promise<ReceiptActionResult> {
  const result = await backendPatch<unknown>(`/api/finances/payments/${paymentId}/receipt`, {
    receipt_url: receiptUrl,
  });

  if (!result.ok) {
    log.error('[saveReceiptUrl] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: appErrorToString(result.error) };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Doctor services (pricing plans) for the "Add item" modal
// ---------------------------------------------------------------------------

/**
 * Fetches the authenticated doctor's active pricing plans and services.
 * Replaces the Supabase direct query on `pricing_plans` in openAddItemModal().
 *
 * Backend: GET /api/doctor/services → PricingPlan[]
 *
 * The backend serializes PricingPlan entity fields. The response uses
 * camelCase property names from the entity class:
 *   id, name, priceUsd, type, isActive, etc.
 *
 * Note: The existing getDoctorServices() in app/doctor/actions.ts uses snake_case
 * shapes (price_usd, is_active) which suggests a snake_case transform is in effect.
 * We align with that observed behavior.
 */
export async function getServicesForModal(): Promise<ServiceForModal[]> {
  const result = await backendGet<unknown[]>('/api/doctor/services');

  if (!result.ok) {
    log.error('[getServicesForModal] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const raw = Array.isArray(result.value) ? result.value : [];

  return raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    .filter((r) => r['isActive'] === true || r['is_active'] === true)
    .map(
      (r): ServiceForModal => ({
        id: String(r['id'] ?? ''),
        name: String(r['name'] ?? ''),
        // Handle both camelCase (priceUsd) and snake_case (price_usd)
        price_usd: Number(r['priceUsd'] ?? r['price_usd'] ?? 0),
        // type: 'plan' | 'service' — default 'plan' for backward compat
        type: (r['type'] === 'service' ? 'service' : 'plan') as 'plan' | 'service',
      }),
    );
}

// ---------------------------------------------------------------------------
// Doctor profile for PDF receipt generation
// ---------------------------------------------------------------------------

/**
 * Fetches the doctor's profile for use in the PDF receipt builder.
 * Replaces the Supabase `profiles` table read in generateReceipt().
 *
 * Backend: GET /api/doctor/profile → DoctorProfile entity
 */
export async function getDoctorProfileForReceipt(): Promise<DoctorProfileForReceipt | null> {
  const result = await backendGet<Record<string, unknown>>('/api/doctor/profile');

  if (!result.ok) {
    log.error('[getDoctorProfileForReceipt] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  const d = result.value;
  return {
    // Handle camelCase (fullName) and snake_case (full_name) shapes
    full_name: String(d['fullName'] ?? d['full_name'] ?? ''),
    professional_title: (d['professionalTitle'] ?? d['professional_title'] ?? null) as
      | string
      | null,
    specialty: (d['specialty'] ?? null) as string | null,
    license_number: (d['licenseNumber'] ?? d['license_number'] ?? null) as string | null,
    email: String(d['email'] ?? ''),
    phone: (d['phone'] ?? null) as string | null,
    logo_url: (d['logoUrl'] ?? d['logo_url'] ?? null) as string | null,
    signature_url: (d['signatureUrl'] ?? d['signature_url'] ?? null) as string | null,
  };
}

// ---------------------------------------------------------------------------
// Update payment details (paid_at, method, reference, bcv_rate, amount_bs)
// ---------------------------------------------------------------------------

export type PaymentDetailsInput = {
  paid_at?: string | null;
  method?: string | null;
  reference?: string | null;
  bcv_rate?: number | null;
  amount_bs?: number | null;
};

export interface PaymentDetailsResult {
  ok: boolean;
  error?: string;
}

/**
 * Updates editable payment details (date, method, reference, BCV rate, amount Bs).
 * Backend: PATCH /api/finances/payments/:paymentId/details
 */
export async function updatePaymentDetails(
  paymentId: string,
  input: PaymentDetailsInput,
): Promise<PaymentDetailsResult> {
  const result = await backendPatch<unknown>(`/api/finances/payments/${paymentId}/details`, input);

  if (!result.ok) {
    log.error('[updatePaymentDetails] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: appErrorToString(result.error) };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// BCV rate for a specific date
// ---------------------------------------------------------------------------

export type BcvRateForDateResult = {
  rate: number | null;
  date: string;
  source: string;
};

/**
 * Fetches the BCV rate for a specific date.
 * Backend: GET /api/settings/bcv-rate?date=YYYY-MM-DD
 * rate=null means rate not available for that date.
 */
export async function getBcvRateForDate(date: string): Promise<BcvRateForDateResult | null> {
  const result = await backendGet<BcvRateForDateResult>(
    `/api/settings/bcv-rate?date=${encodeURIComponent(date)}`,
  );

  if (!result.ok) {
    log.error('[getBcvRateForDate] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

// ---------------------------------------------------------------------------
// Template config for receipt branding
// ---------------------------------------------------------------------------

/**
 * Template config fields used when generating the receipt PDF.
 * The backend only supports 4 template types (informe/recipe/prescripciones/reposo).
 * Until 'recibo' is added as a backend type, we use the 'informe' config as fallback.
 *
 * DEPENDENCIA DE BACKEND PENDIENTE: para que el recibo sea configurable como tipo
 * propio se necesita agregar 'recibo' al enum TemplateType en el backend
 * (template-type.vo.ts). Por ahora, se usa la config de 'informe' como fallback.
 */
export type ReceiptTemplateConfig = {
  primary_color: string;
  header_text: string;
  footer_text: string;
  show_logo: boolean;
  show_signature: boolean;
};

/**
 * Fetches the template config to use for the receipt PDF.
 * Preference order: 'recibo' (future) → 'informe' → hardcoded defaults.
 */
export async function getReceiptTemplateConfig(): Promise<ReceiptTemplateConfig> {
  const defaults: ReceiptTemplateConfig = {
    primary_color: '#0891b2',
    header_text: '',
    footer_text: '',
    show_logo: true,
    show_signature: true,
  };

  const result = await backendGet<unknown[]>('/api/doctor/templates');
  if (!result.ok) return defaults;

  const templates = Array.isArray(result.value) ? result.value : [];
  // Priority: recibo (when backend supports it) → informe → first available
  const priority = ['recibo', 'informe', 'recipe', 'prescripciones', 'reposo'];

  let chosen: Record<string, unknown> | null = null;
  for (const type of priority) {
    const found = templates.find(
      (t): t is Record<string, unknown> =>
        t !== null &&
        typeof t === 'object' &&
        (t as Record<string, unknown>)['templateType'] === type,
    );
    if (found) {
      chosen = found;
      break;
    }
  }

  if (!chosen) return defaults;

  return {
    primary_color: (chosen['primaryColor'] as string | undefined) ?? defaults.primary_color,
    header_text: (chosen['headerText'] as string | undefined) ?? defaults.header_text,
    footer_text: (chosen['footerText'] as string | undefined) ?? defaults.footer_text,
    show_logo: (chosen['showLogo'] as boolean | undefined) ?? defaults.show_logo,
    show_signature: (chosen['showSignature'] as boolean | undefined) ?? defaults.show_signature,
  };
}

// ---------------------------------------------------------------------------
// Export payments as CSV (replaces Supabase appointments read in exportExcel())
// ---------------------------------------------------------------------------

/**
 * Fetches payments filtered by date range for CSV export.
 * Replaces the Supabase `appointments` read in exportExcel().
 *
 * Backend: GET /api/finances/payments?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
 */
export async function getPaymentsForExport(
  fromDate: string,
  toDate: string,
): Promise<PaymentExportRow[]> {
  const qs = new URLSearchParams({
    from_date: `${fromDate}T00:00:00`,
    to_date: `${toDate}T23:59:59`,
  });

  const result = await backendGet<unknown>(`/api/finances/payments?${qs.toString()}`);

  if (!result.ok) {
    log.error('[getPaymentsForExport] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const raw = result.value as unknown;
  let rows: unknown[] = [];

  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)) {
    rows = (raw as { data: unknown[] }).data;
  }

  return rows
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    .map((r): PaymentExportRow => {
      const appt = (r['appointment'] as Record<string, unknown> | null) ?? null;
      const cons = (r['consultation'] as Record<string, unknown> | null) ?? null;
      return {
        scheduled_at: String(appt?.['scheduled_at'] ?? r['created_at'] ?? ''),
        patient_name: String(appt?.['patient_name'] ?? 'Paciente'),
        plan_name: (appt?.['plan_name'] as string | null) ?? null,
        amount_usd: Number(r['amount_usd'] ?? 0),
        payment_method: (r['method_snapshot'] as string | null) ?? null,
        status: String(r['status'] ?? ''),
        appointment_code: (appt?.['appointment_code'] as string | null) ?? null,
        consultation_code: (cons?.['consultation_code'] as string | null) ?? null,
      };
    });
}
