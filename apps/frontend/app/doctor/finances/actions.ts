'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/finances/actions.ts
 *
 * Server Actions for the finances page (expenses / consultations-for-reports).
 * ETAPA 1 — thin-proxy to the NestJS `finances` + `consultations` modules.
 *
 * Backend endpoints used:
 *   GET  /api/finances/transactions?month=YYYY-MM&page=1&limit=500
 *        → financial_transactions (includes type='income'|'expense')
 *   POST /api/finances/expense
 *        → records a manual expense entry
 *   GET  /api/consultations?page=1&limit=100
 *        → paginated consultation list (clinical fields)
 *   GET  /api/consultations/with-patient?limit=100
 *        → consultation list enriched with patient name/phone/email
 *
 * DEFERRED — no backend endpoint yet:
 *   - DELETE /api/finances/transactions/:id  (no delete endpoint for expenses)
 *     The delete-expense feature is left as pending: call is a no-op on the backend.
 *
 * NOTES on ConsultationRow gaps:
 *   The backend consultation list endpoint does NOT return appointment-level fields
 *   (appointment_status, duration_minutes, scheduled_at, appointment_mode,
 *   payment_method, payment_reference, blocks_data). Those fields will be null
 *   until the backend adds an appointments join to the consultation list endpoint.
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { backendGet, backendPost, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape consumed by the finances page Expense table */
export type BackendExpense = {
  id: string;
  vendor_name: string;
  concept: string;
  amount: number;
  due_date: string;
  paid: boolean;
  notes?: string;
};

/** Consultation item enriched with patient data for the Reports tab */
export type BackendConsultationRow = {
  id: string;
  consultation_code: string | null;
  consultation_date: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  patient_cedula: string | null;
  // Appointment-level fields — null until backend joins are added (Fase 5)
  appointment_status: string | null;
  consultation_status: string | null;
  payment_status: string | null;
  duration_minutes: number | null;
  diagnosis: string | null;
  amount_usd: number | null;
  plan_name: string | null;
  chief_complaint: string | null;
  treatment: string | null;
  notes: string | null;
  blocks_data: Record<string, unknown> | null;
  blocks_snapshot: Array<{ key: string; label: string; printable?: boolean }> | null;
  scheduled_at: string | null;
  appointment_mode: string | null;
  payment_method: string | null;
  payment_reference: string | null;
};

interface TransactionItem {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  relatedConsultationId: string | null;
  date: string;
  createdAt: string;
}

interface PaginatedEnvelope<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number };
}

interface ConsultationListItem {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  payment_status: string;
  payment_method: string | null;
  amount: number | null;
  blocks_snapshot: Record<string, unknown> | null;
}

interface ConsultationWithPatient {
  id: string;
  consultation_code: string;
  consultation_date: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
}


// ---------------------------------------------------------------------------
// Expenses (financial_transactions type='expense')
// ---------------------------------------------------------------------------

/**
 * Fetch expense transactions for the authenticated doctor.
 * Optionally filtered by month (YYYY-MM).
 * Maps `financial_transactions` rows to the `Expense` shape expected by the UI.
 */
export async function getExpenses(month?: string): Promise<BackendExpense[]> {
  const qs = new URLSearchParams({ page: '1', limit: '500' });
  if (month) qs.set('month', month);

  const result = await backendGet<PaginatedEnvelope<TransactionItem>>(
    `/api/finances/transactions?${qs.toString()}`,
  );

  if (!result.ok) {
    log.error('[getExpenses] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  // The api-client unwraps envelope.data — for paginated endpoints the full
  // envelope is returned. Handle both shapes defensively.
  const raw = result.value as unknown;
  let items: TransactionItem[] = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedEnvelope<TransactionItem>).data)) {
    items = (raw as PaginatedEnvelope<TransactionItem>).data;
  }

  return items
    .filter((t) => t.type === 'expense')
    .map((t): BackendExpense => ({
      id: t.id,
      // Backend stores the full description — use it as concept.
      // vendor_name falls back to the description (no separate vendor field).
      vendor_name: t.description,
      concept: t.description,
      amount: t.amount,
      due_date: t.date ? t.date.slice(0, 10) : t.createdAt.slice(0, 10),
      paid: true, // financial_transactions are always committed
      notes: t.currency !== 'USD' ? t.currency : undefined,
    }));
}

// ---------------------------------------------------------------------------
// Add expense
// ---------------------------------------------------------------------------

export type AddExpenseInput = {
  concept: string;
  vendorName: string;
  amount: number;
  dueDate: string;
  category: string;
};

export type AddExpenseResult = { success: true } | { success: false; error: string };

/**
 * Record a manual expense for the authenticated doctor.
 * Maps the UI form fields to the backend DTO.
 */
export async function addExpense(input: AddExpenseInput): Promise<AddExpenseResult> {
  const result = await backendPost<unknown>('/api/finances/expense', {
    amount: input.amount,
    currency: 'USD',
    description: input.concept,
    date: `${input.dueDate}T12:00:00.000Z`,
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/finances');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Consultations for reports tab
// ---------------------------------------------------------------------------

/**
 * Fetch consultations enriched with patient data for the reports/KPI tab.
 * Calls two backend endpoints in parallel and joins them in-memory.
 *
 * Fields populated from backend:
 *   consultation_code, consultation_date, payment_status, diagnosis,
 *   chief_complaint, treatment, notes, amount_usd, blocks_snapshot,
 *   patient_name, patient_phone, patient_email
 *
 * Fields NOT yet available (backend gap — appointment join needed):
 *   appointment_status, consultation_status, duration_minutes, scheduled_at,
 *   appointment_mode, payment_method, payment_reference, blocks_data,
 *   patient_cedula, plan_name → all returned as null
 */
export async function getConsultationsForReports(
  limit = 100,
): Promise<BackendConsultationRow[]> {
  const [listResult, withPatientResult] = await Promise.all([
    backendGet<PaginatedEnvelope<ConsultationListItem>>(
      `/api/consultations?page=1&limit=${Math.min(limit, 100)}`,
    ),
    backendGet<unknown>(
      `/api/consultations/with-patient?limit=${Math.min(limit, 100)}`,
    ),
  ]);

  const listItems: ConsultationListItem[] = (() => {
    if (!listResult.ok) {
      log.error('[getConsultationsForReports] list error', {
        code: listResult.error.code,
        status: listResult.error.status,
      });
      return [];
    }
    const raw = listResult.value as unknown;
    if (Array.isArray(raw)) return raw as ConsultationListItem[];
    if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedEnvelope<ConsultationListItem>).data)) {
      return (raw as PaginatedEnvelope<ConsultationListItem>).data;
    }
    return [];
  })();

  // Build patient map for enrichment
  const patientMap = new Map<string, ConsultationWithPatient>();
  if (withPatientResult.ok) {
    const rawWithPatient = withPatientResult.value as unknown;
    const withPatientItems: ConsultationWithPatient[] = Array.isArray(rawWithPatient)
      ? rawWithPatient
      : Array.isArray((rawWithPatient as { data?: unknown[] })?.data)
        ? ((rawWithPatient as { data: ConsultationWithPatient[] }).data)
        : [];

    for (const item of withPatientItems) {
      patientMap.set(item.id, item);
    }
  }

  return listItems.map((c): BackendConsultationRow => {
    const patient = patientMap.get(c.id);
    // The consultation mapper returns blocksSnapshot as a dict but the UI expects
    // an array of { key, label, printable? }. The backend stores it as unknown shape.
    const rawSnapshot = c.blocks_snapshot as unknown;
    const blocksSnapshotArray: Array<{ key: string; label: string; printable?: boolean }> | null =
      Array.isArray(rawSnapshot) ? rawSnapshot : null;

    // payment_status from backend: 'pending' | 'approved'
    // consultation_status is derived from appointment.status in the original Supabase code.
    // Since we don't have appointment data from backend yet, set to null.
    return {
      id: c.id,
      consultation_code: c.consultation_code ?? null,
      consultation_date: c.consultation_date ?? null,
      patient_name: patient?.patient_name ?? 'Paciente',
      patient_email: patient?.patient_email ?? null,
      patient_phone: patient?.patient_phone ?? null,
      patient_cedula: null, // pending: not in backend response
      appointment_status: null, // pending: requires appointment join in backend
      consultation_status: null, // pending: requires appointment.status join
      payment_status: (c.payment_status as 'pending' | 'approved' | null) ?? null,
      duration_minutes: null, // pending: not in consultation entity
      diagnosis: c.diagnosis ?? null,
      amount_usd: c.amount != null ? Number(c.amount) : null,
      plan_name: null, // pending: not in consultation entity
      chief_complaint: c.chief_complaint ?? null,
      treatment: c.treatment ?? null,
      notes: c.notes ?? null,
      blocks_data: null, // pending: not returned by list endpoint
      blocks_snapshot: blocksSnapshotArray,
      scheduled_at: null, // pending: requires appointment join
      appointment_mode: null, // pending: requires appointment join
      payment_method: c.payment_method ?? null,
      payment_reference: null, // pending: requires appointment join
    };
  });
}
