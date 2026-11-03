'use server';

/**
 * app/doctor/dashboard-actions.ts
 *
 * Server actions for the doctor dashboard (page.tsx).
 * Replaces all Supabase reads (profiles, appointments, payments, patients,
 * consultations) with calls to the NestJS backend via api-client.server.
 *
 * Identity is resolved via resolveIdentity() (dev cookies or Auth0 session).
 *
 * Endpoints consumed:
 *   GET /api/doctor/profile           → doctor name / specialty / title
 *   GET /api/appointments?date_from=T&date_to=T&limit=50
 *                                     → today's appointments (status-filtered client-side)
 *   GET /api/finances/summary?month=YYYY-MM → monthly KPIs (totalIncome, consultationCount)
 *   GET /api/patients?limit=1         → meta.total for patient count
 *   GET /api/consultations?limit=1    → meta.total for consultation count
 *
 * NOTE — lifetime revenue KPI: `/api/finances/summary` is always month-scoped.
 * The "Ingresos totales" KPI currently shows current-month income.
 * TODO: add GET /api/finances/lifetime to the NestJS backend for true all-time total.
 *
 * NOTE — meta.total: backendGet/backendFetch unwrap envelope.data only (meta is discarded).
 * countFromEndpoint() uses a direct fetch with dev-auth headers to access meta.total.
 *
 * NOTE — realtime refresh: the Supabase Realtime channel for auto-refresh is removed.
 * The component re-fetches when the month changes via useEffect dependency.
 */

import 'server-only';

import { backendGet, backendGetPaged } from '@/lib/api-client.server';
import { resolveIdentity } from '@/lib/identity.server';
import { log } from '@/lib/logger';
import { toLocalYMD, caracasToISO } from '@/lib/timezone';
import { getDoctorProfile } from '@/app/doctor/actions';

// ---------------------------------------------------------------------------
// Re-export profile (already migrated in shared actions.ts)
// ---------------------------------------------------------------------------

export { getDoctorProfile };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Appointment shape returned by the backend list endpoint. */
export interface DashboardAppointment {
  id: string;
  /** UUID of the registered patient — null for anonymous bookings. Never masked. */
  patientId: string | null;
  /** PII-masked patient name e.g. "Juan R." */
  patientName: string | null;
  scheduledAt: string;
  status: string;
  consultationId: string | null;
}

/**
 * Financial summary shape from /api/finances/summary.
 * Field names are camelCase as returned by the NestJS use case.
 */
export interface DashboardFinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  consultationCount: number;
  pendingAmount: number;
  netBS: number | null;
  currency: 'USD';
  rateUsed: number | null;
  month: string;
}

/** Aggregate stats fetched in parallel for the 3 KPI cards. */
export interface DashboardAllTimeStats {
  totalPatients: number;
  totalConsultations: number;
  /**
   * Current-month income used as the "Ingresos totales" KPI.
   * True lifetime total pending a dedicated backend endpoint.
   */
  totalIncomeCurrentMonth: number;
}

// ---------------------------------------------------------------------------
// Internal helper — access meta.total from paginated endpoints
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

/**
 * Fetches a paginated backend endpoint and returns meta.total.
 * Uses a direct fetch with dev-auth headers to access the full envelope
 * (backendGet/backendFetch unwrap only envelope.data and discard meta).
 */
async function countFromEndpoint(path: string): Promise<number> {
  try {
    const devUser = await resolveIdentity();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': devUser.id,
        'x-dev-user-role': devUser.role,
      },
    });

    if (!response.ok) return 0;

    const json = (await response.json()) as {
      success?: boolean;
      meta?: { total?: number };
    };

    return json.meta?.total ?? 0;
  } catch (error: unknown) {
    log.error('[countFromEndpoint] fetch error', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Today's appointments
// ---------------------------------------------------------------------------

/** Raw appointment item shape from the backend list response (camelCase from entity). */
interface BackendAppointmentItem {
  id: string;
  /** UUID of the registered patient record — null for anonymous bookings. */
  patientId: string | null;
  patientName: string | null;
  scheduledAt: string;
  status: string;
  consultationId: string | null;
}

/** Fetch appointments for today scoped to the authenticated doctor. */
export async function getTodayAppointments(): Promise<DashboardAppointment[]> {
  // Boundaries of "today" in America/Caracas (UTC-04:00, no DST), not the server's
  // UTC midnight — otherwise a 20:00 Caracas appointment (00:00 UTC next day) would
  // fall outside today's window. toLocalYMD gives the Caracas calendar date.
  const todayYmd = toLocalYMD(new Date());
  const dateFrom = caracasToISO(todayYmd, '00:00'); // YYYY-MM-DDT00:00:00-04:00
  const dateTo = `${todayYmd}T23:59:59.999-04:00`;

  const result = await backendGet<BackendAppointmentItem[]>(
    `/api/appointments?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=50`,
  );

  if (!result.ok) {
    log.error('[getTodayAppointments] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];

  // Mirror the previous Supabase .in('status', ['scheduled', 'confirmed', 'completed']) filter.
  const VISIBLE_STATUSES = new Set(['scheduled', 'confirmed', 'completed']);

  return items
    .filter((a) => VISIBLE_STATUSES.has(a.status))
    .map((a) => ({
      id: a.id,
      patientId: a.patientId ?? null,
      patientName: a.patientName ?? null,
      scheduledAt: a.scheduledAt,
      status: a.status,
      consultationId: a.consultationId ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Monthly financial summary
// ---------------------------------------------------------------------------

/**
 * Fetch the financial summary for a given month.
 * @param month Optional 'YYYY-MM' string — defaults to current month when omitted.
 */
export async function getDashboardFinanceSummary(
  month?: string,
): Promise<DashboardFinanceSummary | null> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const result = await backendGet<DashboardFinanceSummary>(`/api/finances/summary${qs}`);

  if (!result.ok) {
    log.error('[getDashboardFinanceSummary] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

// ---------------------------------------------------------------------------
// All-time aggregate stats (3 KPI cards)
// ---------------------------------------------------------------------------

/**
 * Fetch all-time aggregate stats in parallel: patient count, consultation count,
 * and current-month income (used for the "Ingresos totales" KPI).
 */
export async function getDashboardAllTimeStats(): Promise<DashboardAllTimeStats> {
  const [totalPatients, totalConsultations, financeResult] = await Promise.all([
    countFromEndpoint('/api/patients?limit=1'),
    countFromEndpoint('/api/consultations?limit=1'),
    backendGet<DashboardFinanceSummary>('/api/finances/summary'),
  ]);

  const totalIncomeCurrentMonth =
    financeResult.ok && financeResult.value ? (financeResult.value.totalIncome ?? 0) : 0;

  return { totalPatients, totalConsultations, totalIncomeCurrentMonth };
}

// ---------------------------------------------------------------------------
// Scheduled appointments (widget "Por confirmar")
// ---------------------------------------------------------------------------

/**
 * Minimal shape for the dashboard "Por confirmar" widget.
 * Only the fields needed to display the card and fire the confirm action.
 */
export type ScheduledAppointment = {
  id: string;
  /** UUID of the registered patient — used to detect duplicate bookings. */
  patientId: string | null;
  patientName: string | null;
  scheduledAt: string;
};

/**
 * Fetch appointments with status=scheduled (pending doctor confirmation),
 * scoped to TODAY onwards (America/Caracas).
 * Returns up to 20, ordered ascending by scheduledAt.
 * Used by the "Por confirmar" widget on the dashboard.
 */
export async function getScheduledAppointments(): Promise<ScheduledAppointment[]> {
  const todayYmd = toLocalYMD(new Date());
  const dateFrom = caracasToISO(todayYmd, '00:00'); // appointments from today's start

  const result = await backendGet<BackendAppointmentItem[]>(
    `/api/appointments?status=scheduled&date_from=${encodeURIComponent(dateFrom)}&page=1&limit=20`,
  );

  if (!result.ok) {
    log.error('[getScheduledAppointments] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];

  return [...items]
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .map(
      (a): ScheduledAppointment => ({
        id: a.id,
        patientId: a.patientId ?? null,
        patientName: a.patientName ?? null,
        scheduledAt: a.scheduledAt,
      }),
    );
}

// ---------------------------------------------------------------------------
// Past unconfirmed appointments (widget "¿La atendiste?")
// ---------------------------------------------------------------------------

/**
 * Minimal shape for the "¿La atendiste?" dashboard widget.
 * Appointments that were scheduled before today and never confirmed/completed.
 */
export type PastUnconfirmedAppointment = {
  id: string;
  patientId: string | null;
  patientName: string | null;
  scheduledAt: string;
};

/** Result of the "¿La atendiste?" query: the most recent rows plus the real total. */
export type PastUnconfirmedResult = {
  items: PastUnconfirmedAppointment[];
  total: number;
};

const PAST_UNCONFIRMED_PAGE_SIZE = 100; // backend caps `limit` at 100

/**
 * Fetch appointments with status=scheduled whose scheduledAt is BEFORE today
 * (America/Caracas), most recent first, plus the total count.
 *
 * The backend only sorts ascending, so page 1 holds the OLDEST rows. When there
 * are more rows than one page, the last page is requested instead so the widget
 * always shows the most recent ones.
 */
export async function getPastUnconfirmedAppointments(): Promise<PastUnconfirmedResult> {
  // Today's start in Caracas; the backend's date_to is inclusive, so subtract 1 ms.
  const todayStart = caracasToISO(toLocalYMD(new Date()), '00:00');
  const dateTo = new Date(new Date(todayStart).getTime() - 1).toISOString();
  const basePath = `/api/appointments?status=scheduled&date_to=${encodeURIComponent(dateTo)}&limit=${PAST_UNCONFIRMED_PAGE_SIZE}`;

  const firstPage = await backendGetPaged<BackendAppointmentItem>(`${basePath}&page=1`);
  if (!firstPage.ok) {
    log.error('[getPastUnconfirmedAppointments] backend error', {
      code: firstPage.error.code,
      status: firstPage.error.status,
    });
    return { items: [], total: 0 };
  }

  let page = firstPage.value;
  if (page.total > PAST_UNCONFIRMED_PAGE_SIZE) {
    const lastPage = Math.ceil(page.total / PAST_UNCONFIRMED_PAGE_SIZE);
    const lastResult = await backendGetPaged<BackendAppointmentItem>(
      `${basePath}&page=${lastPage}`,
    );
    // Fall back to page 1 (older rows, still actionable) if the last page fails or
    // came back empty because rows were resolved between the two requests.
    if (lastResult.ok && lastResult.value.items.length > 0) {
      page = lastResult.value;
    } else if (!lastResult.ok) {
      log.error('[getPastUnconfirmedAppointments] last page error', {
        code: lastResult.error.code,
        status: lastResult.error.status,
      });
    }
  }

  const items = [...page.items]
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .map(
      (a): PastUnconfirmedAppointment => ({
        id: a.id,
        patientId: a.patientId ?? null,
        patientName: a.patientName ?? null,
        scheduledAt: a.scheduledAt,
      }),
    );

  return { items, total: page.total };
}
