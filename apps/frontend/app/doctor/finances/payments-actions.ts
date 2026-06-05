'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/finances/payments-actions.ts
 *
 * Server Actions for the finance payments domain (cobros / dashboard / finanzas).
 * ETAPA 1 — thin-proxy to the NestJS `finances` module via api-client.server (BFF).
 * Replaces the direct Supabase queries that lived in lib/finances.ts and the
 * cobros page. The backend is the source of truth (payments.status='approved').
 *
 * Backend endpoints (doctorId derived from the dev-stub on the backend):
 *   GET    /api/finances/payments            → list (joins appointment+consultation)
 *   PUT    /api/finances/payments/:id/status → approve / mark pending
 *   GET    /api/finances/payments/:id/items  → line items
 *   POST   /api/finances/payments/:id/items  → add line item (recalcs total)
 *   DELETE /api/finances/payments/:id/items/:itemId → remove (recalcs total)
 *
 * DEFERRED — Fase 5 (no backend endpoint): receipt upload (storage→GCS),
 * realtime refresh, PDF receipt generation.
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import {
  backendGet,
  backendPut,
  backendPost,
  backendDelete,
  type AppError,
} from '@/lib/api-client.server';
import type { PaymentRow } from '@/lib/finances';

export type PaymentsFilters = {
  status?: 'pending' | 'approved' | 'all';
  fromDate?: string;
  toDate?: string;
};

export type PaymentItemRow = { id: string; name: string; amount_usd: number };

export type PaymentActionResult = { success: true } | { success: false; error: string };

interface Envelope<T> {
  success: boolean;
  data: T;
}


/** Fetch the authenticated doctor's payments (joined with appointment + consultation). */
export async function getPayments(filters: PaymentsFilters = {}): Promise<PaymentRow[]> {
  const qs = new URLSearchParams();
  if (filters.status && filters.status !== 'all') qs.set('status', filters.status);
  if (filters.fromDate) qs.set('from_date', filters.fromDate);
  if (filters.toDate) qs.set('to_date', filters.toDate);

  const result = await backendGet<Envelope<PaymentRow[]>>(
    `/api/finances/payments?${qs.toString()}`,
  );

  if (!result.ok) {
    log.error('[getPayments] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value.data) ? result.value.data : [];
}

/** Approve a payment or mark it pending. Backend syncs consultations.payment_status. */
export async function updatePaymentStatus(
  paymentId: string,
  status: 'pending' | 'approved',
): Promise<PaymentActionResult> {
  const result = await backendPut<Envelope<unknown>>(`/api/finances/payments/${paymentId}/status`, {
    status,
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/cobros');
  revalidatePath('/doctor/finances');
  return { success: true };
}

/** List the extra line items of a payment. */
export async function getPaymentItems(paymentId: string): Promise<PaymentItemRow[]> {
  const result = await backendGet<Envelope<PaymentItemRow[]>>(
    `/api/finances/payments/${paymentId}/items`,
  );

  if (!result.ok) {
    log.error('[getPaymentItems] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value.data) ? result.value.data : [];
}

/** Add an extra line item; backend recalculates the payment total + appointment.plan_price. */
export async function addPaymentItem(
  paymentId: string,
  input: { name: string; amountUsd: number; sourceType?: string; sourceId?: string },
): Promise<PaymentActionResult & { item?: PaymentItemRow }> {
  const result = await backendPost<Envelope<PaymentItemRow>>(
    `/api/finances/payments/${paymentId}/items`,
    {
      name: input.name,
      amount_usd: input.amountUsd,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
    },
  );

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/cobros');
  return { success: true, item: result.value.data };
}

/** Remove an extra line item; backend recalculates the payment total. */
export async function removePaymentItem(
  paymentId: string,
  itemId: string,
): Promise<PaymentActionResult> {
  const result = await backendDelete<Envelope<unknown>>(
    `/api/finances/payments/${paymentId}/items/${itemId}`,
  );

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/cobros');
  return { success: true };
}
