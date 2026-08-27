'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/finances/actions.ts
 *
 * Server Actions for the finances page (expenses / income / consultations-for-reports).
 * ETAPA 1 — thin-proxy to the NestJS `finances` + `consultations` modules.
 *
 * Backend endpoints used:
 *   GET  /api/finances/transactions?month=YYYY-MM&page=1&limit=500
 *        → financial_transactions (includes type='income'|'expense')
 *   GET  /api/finances/income-transactions?month=YYYY-MM&limit=200
 *        → financial_transactions type='income' (manual incomes) with patientId + patientName
 *   POST /api/finances/expense
 *        → records a manual expense entry
 *   GET  /api/finances/income-concepts
 *        → list of income concepts [{ id, name, isActive, sortOrder }]
 *   POST /api/finances/income-concepts
 *        → create income concept { name }
 *   PUT  /api/finances/income-concepts/:id
 *        → update income concept { name?, isActive?, sortOrder? }
 *   DELETE /api/finances/income-concepts/:id → 204
 *   POST /api/finances/income
 *        → record manual income { amount, currency?, description, conceptId?, date?,
 *          relatedConsultationId?, patientId? }
 *          RULE: if relatedConsultationId is set, patientId is derived from the
 *          consultation (patientId is ignored). If not, patientId is used directly.
 *   PUT  /api/finances/transactions/:id
 *        → edit transaction { description?, amount?, currency?, transactionDate?, conceptId? }
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
import {
  backendGet,
  backendGetPaged,
  backendPost,
  backendPut,
  backendDelete,
  type PagedResult,
} from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Income breakdown from GET /api/finances/summary */
export type IncomeBreakdown = {
  consultationsApproved: number;
  consultationsPending: number;
  manualIncome: number;
};

/** Expense breakdown by concept from GET /api/finances/summary */
export type ExpenseBreakdown = {
  rent: number;
  staff: number;
  supplies: number;
  services: number;
  taxes: number;
  other: number;
};

/** Summary from GET /api/finances/summary?month=YYYY-MM */
export type FinanceSummary = {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  incomeBreakdown: IncomeBreakdown;
  expenseBreakdown: ExpenseBreakdown;
};

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
// Manual incomes (financial_transactions type='income')
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/finances/income-transactions */
export type IncomeTransactionItem = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  conceptId: string | null;
  patientId: string | null;
  patientName: string | null;
};

/**
 * Fetch manual income transactions for the authenticated doctor.
 * Calls GET /api/finances/income-transactions?month=YYYY-MM&limit=200.
 * Returns an empty array on error (page renders with partial data rather than crashing).
 */
export async function getManualIncomes(month?: string): Promise<IncomeTransactionItem[]> {
  const qs = new URLSearchParams({ limit: '200' });
  if (month) qs.set('month', month);

  const result = await backendGet<unknown>(`/api/finances/income-transactions?${qs.toString()}`);

  if (!result.ok) {
    log.error('[getManualIncomes] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const raw = result.value as unknown;
  if (Array.isArray(raw)) return raw as IncomeTransactionItem[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)) {
    return (raw as { data: IncomeTransactionItem[] }).data;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Income unified list — paged (GET /api/finances/income)
// ---------------------------------------------------------------------------

/** Unified income item: consultation payment OR manual income entry */
export type IncomePageItem = {
  id: string;
  date: string;
  amount_usd: number;
  source: 'consultation' | 'manual';
  status: 'pending' | 'approved' | null;
  concept: string | null;
  patient_name: string | null;
  patient_id: string | null;
  reference: string | null;
};

/** Tope duro del backend por request (finances.controller). */
const FINANCES_REQUEST_LIMIT = 100;

/** Corta en 5.000 filas: evita un bucle infinito si `total` miente. */
const FINANCES_MAX_PAGES = 50;

/**
 * Recorre TODAS las páginas de un endpoint paginado de finanzas.
 *
 * El backend recorta cualquier `limit` a 100. Pedir `limit=500` no trae 500:
 * trae 100 y no avisa. Con "Todas" el Paginator además fija `totalPages = 1` y
 * rotula "1–{total} de {total}", así que el especialista leía que estaba viendo
 * todo mientras faltaban filas de plata. Esto pagina de verdad.
 *
 * Si una página falla devuelve lo ya juntado —una página rota no debe vaciar la
 * lista— y lo deja registrado.
 */
async function traerTodasLasPaginas<T>(
  construirUrl: (page: number, limit: number) => string,
  etiqueta: string,
): Promise<PagedResult<T>> {
  const juntadas: T[] = [];
  let total = 0;

  for (let page = 1; page <= FINANCES_MAX_PAGES; page++) {
    const result = await backendGetPaged<T>(construirUrl(page, FINANCES_REQUEST_LIMIT));

    if (!result.ok) {
      log.error(`[${etiqueta}] backend error`, {
        code: result.error.code,
        status: result.error.status,
        page,
      });
      break;
    }

    juntadas.push(...result.value.items);
    total = result.value.total;

    if (result.value.items.length < FINANCES_REQUEST_LIMIT) break;
    if (juntadas.length >= total) break;

    if (page === FINANCES_MAX_PAGES) {
      log.error(`[${etiqueta}] tope de paginación alcanzado`, {
        juntadas: juntadas.length,
        total,
      });
    }
  }

  return { items: juntadas, total: Math.max(total, juntadas.length) };
}

/**
 * Fetch a page of unified income entries (consultation payments + manual incomes).
 * Calls GET /api/finances/income?month=YYYY-MM&page=N&limit=N.
 *
 * `limit === 0` (PAGE_SIZE_ALL, el botón "Todas") recorre todas las páginas.
 */
export async function getIncomePaged(opts: {
  page: number;
  limit: number;
  month?: string;
}): Promise<PagedResult<IncomePageItem>> {
  const url = (page: number, limit: number) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (opts.month) qs.set('month', opts.month);
    return `/api/finances/income?${qs.toString()}`;
  };

  if (opts.limit === 0) {
    return traerTodasLasPaginas<IncomePageItem>(url, 'getIncomePaged');
  }

  const limit = Math.min(opts.limit > 0 ? opts.limit : 20, FINANCES_REQUEST_LIMIT);
  const result = await backendGetPaged<IncomePageItem>(url(opts.page, limit));

  if (!result.ok) {
    log.error('[getIncomePaged] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { items: [], total: 0 };
  }

  return result.value;
}

// ---------------------------------------------------------------------------
// Expenses paged (GET /api/finances/transactions?type=expense)
// ---------------------------------------------------------------------------

/** Mapea una fila de `financial_transactions` a la forma que espera la UI. */
function aEgreso(t: TransactionItem): BackendExpense {
  return {
    id: t.id,
    vendor_name: t.description,
    concept: t.description,
    amount: t.amount,
    due_date: t.date ? t.date.slice(0, 10) : t.createdAt.slice(0, 10),
    paid: true,
    notes: t.currency !== 'USD' ? t.currency : undefined,
  };
}

/**
 * Fetch a page of expense transactions.
 * Calls GET /api/finances/transactions?type=expense&month=YYYY-MM&page=N&limit=N.
 *
 * `limit === 0` (PAGE_SIZE_ALL, el botón "Todas") recorre todas las páginas.
 */
export async function getExpensesPaged(opts: {
  page: number;
  limit: number;
  month?: string;
}): Promise<PagedResult<BackendExpense>> {
  const url = (page: number, limit: number) => {
    const qs = new URLSearchParams({
      type: 'expense',
      page: String(page),
      limit: String(limit),
    });
    if (opts.month) qs.set('month', opts.month);
    return `/api/finances/transactions?${qs.toString()}`;
  };

  if (opts.limit === 0) {
    const todas = await traerTodasLasPaginas<TransactionItem>(url, 'getExpensesPaged');
    const mapeadas = todas.items.filter((t) => t.type === 'expense').map(aEgreso);
    return { items: mapeadas, total: mapeadas.length };
  }

  const limit = Math.min(opts.limit > 0 ? opts.limit : 20, FINANCES_REQUEST_LIMIT);
  const result = await backendGetPaged<TransactionItem>(url(opts.page, limit));

  if (!result.ok) {
    log.error('[getExpensesPaged] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { items: [], total: 0 };
  }

  const mapped = result.value.items.filter((t) => t.type === 'expense').map(aEgreso);

  return { items: mapped, total: result.value.total };
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
  // Pedía `limit=500` de una sola vez y el backend recortaba a 100 sin avisar:
  // con más de 100 egresos en el mes, el listado y el CSV salían incompletos y
  // parecían completos. Ahora recorre las páginas.
  const { items } = await traerTodasLasPaginas<TransactionItem>((page, limit) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (month) qs.set('month', month);
    return `/api/finances/transactions?${qs.toString()}`;
  }, 'getExpenses');

  return items
    .filter((t) => t.type === 'expense')
    .map(
      (t): BackendExpense => ({
        id: t.id,
        // Backend stores the full description — use it as concept.
        // vendor_name falls back to the description (no separate vendor field).
        vendor_name: t.description,
        concept: t.description,
        amount: t.amount,
        due_date: t.date ? t.date.slice(0, 10) : t.createdAt.slice(0, 10),
        paid: true, // financial_transactions are always committed
        notes: t.currency !== 'USD' ? t.currency : undefined,
      }),
    );
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
// Income concepts
// ---------------------------------------------------------------------------

export type IncomeConcept = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export type ConceptResult =
  | { success: true; data: IncomeConcept }
  | { success: false; error: string };
export type SimpleResult = { success: true } | { success: false; error: string };

/**
 * Fetch all income concepts for the authenticated doctor.
 */
export async function getIncomeConcepts(): Promise<IncomeConcept[]> {
  const result = await backendGet<IncomeConcept[]>('/api/finances/income-concepts');
  if (!result.ok) {
    log.error('[getIncomeConcepts] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }
  const raw = result.value as unknown;
  if (Array.isArray(raw)) return raw as IncomeConcept[];
  return [];
}

/**
 * Create a new income concept.
 */
export async function createIncomeConcept(name: string): Promise<ConceptResult> {
  const result = await backendPost<IncomeConcept>('/api/finances/income-concepts', {
    name: name.trim(),
  });
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }
  revalidatePath('/doctor/finances');
  return { success: true, data: result.value };
}

/**
 * Update an income concept (name / isActive / sortOrder).
 */
export async function updateIncomeConcept(
  id: string,
  patch: { name?: string; isActive?: boolean; sortOrder?: number },
): Promise<ConceptResult> {
  const result = await backendPut<IncomeConcept>(`/api/finances/income-concepts/${id}`, patch);
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }
  revalidatePath('/doctor/finances');
  return { success: true, data: result.value };
}

/**
 * Delete an income concept.
 */
export async function deleteIncomeConcept(id: string): Promise<SimpleResult> {
  const result = await backendDelete<void>(`/api/finances/income-concepts/${id}`);
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }
  revalidatePath('/doctor/finances');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Add income (extraordinary / manual)
// ---------------------------------------------------------------------------

export type AddIncomeInput = {
  description: string;
  amount: number;
  currency: string;
  conceptId?: string;
  date?: string;
  /**
   * If set, the backend derives the patient from the consultation (anti-IDOR).
   * When present, patientId is ignored by the backend.
   */
  relatedConsultationId?: string | null;
  /**
   * Direct patient association. Used only when relatedConsultationId is absent.
   * Backend validates ownership before persisting.
   */
  patientId?: string | null;
};

export type AddIncomeResult = { success: true } | { success: false; error: string };

/**
 * Record a manual extraordinary income for the authenticated doctor.
 *
 * Association logic (mirrors backend rule):
 *   - relatedConsultationId present → patient is derived from the consultation.
 *   - relatedConsultationId absent + patientId present → direct patient link.
 *   - Both absent → generic income without patient association.
 */
export async function addIncome(input: AddIncomeInput): Promise<AddIncomeResult> {
  const payload: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency || 'USD',
    description: input.description.trim(),
  };
  if (input.conceptId) payload.conceptId = input.conceptId;
  if (input.date) payload.date = `${input.date}T12:00:00.000Z`;
  if (input.relatedConsultationId) {
    // Backend RecordFinanceEntryDto is `.strict()` and expects snake_case here
    // (`related_consultation_id`). Sending camelCase triggers "Unrecognized key".
    payload.related_consultation_id = input.relatedConsultationId;
  } else if (input.patientId) {
    payload.patientId = input.patientId;
  }

  const result = await backendPost<unknown>('/api/finances/income', payload);
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }
  revalidatePath('/doctor/finances');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Edit transaction (expense or income)
// ---------------------------------------------------------------------------

export type EditTransactionInput = {
  id: string;
  description?: string;
  amount?: number;
  currency?: string;
  transactionDate?: string;
  conceptId?: string | null;
};

export type EditTransactionResult = { success: true } | { success: false; error: string };

/**
 * Delete an existing financial transaction (expense or manual income).
 */
export async function deleteTransaction(id: string): Promise<SimpleResult> {
  const result = await backendDelete<void>(`/api/finances/transactions/${id}`);
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }
  revalidatePath('/doctor/finances');
  return { success: true };
}

/**
 * Edit an existing financial transaction (expense or manual income).
 */
export async function editTransaction(input: EditTransactionInput): Promise<EditTransactionResult> {
  const { id, ...patch } = input;

  // Build patch without undefined keys
  const body: Record<string, unknown> = {};
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.amount !== undefined) body.amount = patch.amount;
  if (patch.currency !== undefined) body.currency = patch.currency;
  if (patch.transactionDate !== undefined)
    body.transactionDate = `${patch.transactionDate}T12:00:00.000Z`;
  if ('conceptId' in patch) body.conceptId = patch.conceptId ?? null;

  const result = await backendPut<unknown>(`/api/finances/transactions/${id}`, body);
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }
  revalidatePath('/doctor/finances');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Finance summary (GET /api/finances/summary)
// ---------------------------------------------------------------------------

/**
 * Fetch the finance summary for a given month.
 * Returns incomeBreakdown (consultationsApproved, consultationsPending, manualIncome)
 * and expenseBreakdown (rent, staff, supplies, services, taxes, other).
 */
export async function getFinanceSummary(month: string): Promise<FinanceSummary | null> {
  const qs = new URLSearchParams({ month });
  const result = await backendGet<FinanceSummary>(`/api/finances/summary?${qs.toString()}`);

  if (!result.ok) {
    log.error('[getFinanceSummary] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  // Defensive coerce — backend might return partials
  const raw = result.value as Partial<FinanceSummary>;
  const ib = (raw.incomeBreakdown ?? {}) as Partial<IncomeBreakdown>;
  const eb = (raw.expenseBreakdown ?? {}) as Partial<ExpenseBreakdown>;

  return {
    totalIncome: Number(raw.totalIncome ?? 0),
    totalExpenses: Number(raw.totalExpenses ?? 0),
    balance: Number(raw.balance ?? 0),
    incomeBreakdown: {
      consultationsApproved: Number(ib.consultationsApproved ?? 0),
      consultationsPending: Number(ib.consultationsPending ?? 0),
      manualIncome: Number(ib.manualIncome ?? 0),
    },
    expenseBreakdown: {
      rent: Number(eb.rent ?? 0),
      staff: Number(eb.staff ?? 0),
      supplies: Number(eb.supplies ?? 0),
      services: Number(eb.services ?? 0),
      taxes: Number(eb.taxes ?? 0),
      other: Number(eb.other ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Add expense with concept (POST /api/finances/expense)
// ---------------------------------------------------------------------------

export type AddExpenseWithConceptInput = {
  amount: number;
  concept: string;
  description: string;
  date: string;
};

/**
 * Record a manual expense with concept category.
 * Maps directly to POST /api/finances/expense { amount, currency, description, concept, date }.
 */
export async function addExpenseWithConcept(
  input: AddExpenseWithConceptInput,
): Promise<AddExpenseResult> {
  const result = await backendPost<unknown>('/api/finances/expense', {
    amount: input.amount,
    currency: 'USD',
    description: input.description,
    concept: input.concept,
    date: `${input.date}T12:00:00.000Z`,
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
export async function getConsultationsForReports(limit = 100): Promise<BackendConsultationRow[]> {
  const [listResult, withPatientResult] = await Promise.all([
    backendGet<PaginatedEnvelope<ConsultationListItem>>(
      `/api/consultations?page=1&limit=${Math.min(limit, 100)}`,
    ),
    backendGet<unknown>(`/api/consultations/with-patient?limit=${Math.min(limit, 100)}`),
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
    if (
      raw &&
      typeof raw === 'object' &&
      Array.isArray((raw as PaginatedEnvelope<ConsultationListItem>).data)
    ) {
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
        ? (rawWithPatient as { data: ConsultationWithPatient[] }).data
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
