'use server';

/**
 * app/doctor/consultations/actions.ts
 *
 * Server Actions for the consultations module.
 *
 * ETAPA 1 — thin-proxy to the NestJS backend via api-client.server.
 * The existing UI (page.tsx) calls the route handlers at /api/doctor/consultations
 * via fetch() and also calls Supabase directly via createClient(). The fetch()
 * calls are already proxied by the migrated route handler. The direct Supabase
 * calls in page.tsx are deferred — they will be replaced with these actions
 * in the next sprint (UI migration).
 *
 * Backend endpoints:
 *   GET    /api/consultations               → list (doctor-wide)
 *   GET    /api/consultations/patient/:id   → patient history
 *   GET    /api/consultations/:id           → single consultation
 *   POST   /api/consultations               → create
 *   PUT    /api/consultations/:id           → update
 *   PUT    /api/consultations/:id/payment   → approve payment
 *
 * DEFERRED — Fase 5:
 *   - blocks_data / blocks_snapshot (report builder)
 *   - amount / payment_method / BCV rate / payments table sync
 *   - duration_minutes auto-calc (started_at / ended_at)
 *   - Google Calendar sync on delete
 *   - Package session restore on delete
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { backendGet, backendPost, backendPut, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Consultation = {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string | null;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  payment_status: 'pending' | 'approved';
  payment_method: string | null;
  amount: number | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export type ConsultationActionResult = { success: true } | { success: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------

/** Fetch all consultations for the authenticated doctor. */
export async function listConsultations(opts?: {
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: 'pending' | 'approved';
  page?: number;
  limit?: number;
}): Promise<Consultation[]> {
  const qs = new URLSearchParams({
    page: String(opts?.page ?? 1),
    limit: String(opts?.limit ?? 50),
  });
  if (opts?.dateFrom) qs.set('date_from', opts.dateFrom);
  if (opts?.dateTo) qs.set('date_to', opts.dateTo);
  if (opts?.paymentStatus) qs.set('payment_status', opts.paymentStatus);

  const result = await backendGet<Consultation[]>(`/api/consultations?${qs.toString()}`);

  if (!result.ok) {
    log.error('[listConsultations] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/** Fetch consultation history for a specific patient. */
export async function getPatientConsultations(patientId: string): Promise<Consultation[]> {
  const result = await backendGet<Consultation[]>(
    `/api/consultations/patient/${patientId}?page=1&limit=100`,
  );

  if (!result.ok) {
    log.error('[getPatientConsultations] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/** Fetch a single consultation. */
export async function getConsultation(consultationId: string): Promise<Consultation | null> {
  const result = await backendGet<Consultation>(`/api/consultations/${consultationId}`);

  if (!result.ok) {
    log.error('[getConsultation] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/** Create a new consultation. */
export async function createConsultation(input: {
  patient_id: string;
  appointment_id?: string | null;
  consultation_date?: string;
  chief_complaint?: string | null;
  notes?: string | null;
}): Promise<ConsultationActionResult & { code?: string; consultation_id?: string }> {
  const body: Record<string, unknown> = {
    patient_id: input.patient_id,
    consultation_date: input.consultation_date ?? new Date().toISOString(),
    chief_complaint: input.chief_complaint ?? null,
    notes: input.notes ?? null,
  };
  if (input.appointment_id) body.appointment_id = input.appointment_id;

  const result = await backendPost<{ id: string; consultation_code: string }>(
    '/api/consultations',
    body,
  );

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/consultations');
  return {
    success: true,
    code: result.value.consultation_code,
    consultation_id: result.value.id,
  };
}

/** Update clinical fields on a consultation. */
export async function updateConsultation(
  consultationId: string,
  fields: {
    chief_complaint?: string | null;
    notes?: string | null;
    diagnosis?: string | null;
    treatment?: string | null;
    consultation_date?: string;
  },
): Promise<ConsultationActionResult> {
  const result = await backendPut<Consultation>(`/api/consultations/${consultationId}`, fields);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/consultations');
  return { success: true };
}

/** Approve payment on a consultation. */
export async function approveConsultationPayment(
  consultationId: string,
): Promise<ConsultationActionResult> {
  const result = await backendPut<Consultation>(`/api/consultations/${consultationId}`, {
    payment_status: 'approved',
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/consultations');
  return { success: true };
}
