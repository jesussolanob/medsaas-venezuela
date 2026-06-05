'use server';

/**
 * app/doctor/notification-actions.ts
 *
 * Server actions used by DoctorNotificationToast for appointment polling.
 * ETAPA 1 — replaces Supabase Realtime subscription.
 *
 * Backend endpoint: GET /api/appointments?status=scheduled&limit=5&date_from=<2min_ago>
 *
 * Only `id`, `patient_name`, `scheduled_at`, `plan_name`, `plan_price` are needed.
 * The backend returns masked PII in list views; we use the masked name for the toast
 * which is acceptable (the doctor knows who they just booked with by context).
 *
 * FASE 5: Replace setInterval polling in the client with SSE/WebSocket push once
 * the backend implements a notification channel.
 */

import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export interface NotificationAppointment {
  id: string;
  patient_name: string;
  scheduled_at: string;
  plan_name: string | null;
  plan_price: number | null;
}

/** Raw appointment shape returned by GET /api/appointments (subset). */
interface BackendAppointmentRaw {
  id: string;
  patientName?: string;
  patient_name?: string;
  scheduledAt?: string;
  scheduled_at?: string;
  planName?: string | null;
  plan_name?: string | null;
  planPrice?: number | null;
  plan_price?: number | null;
}

/**
 * Fetch appointments created in the last 2 minutes with status=scheduled.
 * Used by DoctorNotificationToast to detect newly booked appointments.
 *
 * Returns an empty array on error to keep polling non-blocking.
 */
export async function getRecentAppointmentsForNotification(): Promise<NotificationAppointment[]> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const qs = new URLSearchParams({
    status: 'scheduled',
    limit: '5',
    date_from: twoMinutesAgo,
  });

  const result = await backendGet<unknown>(`/api/appointments?${qs.toString()}`);

  if (!result.ok) {
    log.warn('[getRecentAppointmentsForNotification] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  // Backend may return array directly or wrapped in { data: [] }.
  let raw: unknown[] = [];
  if (Array.isArray(result.value)) {
    raw = result.value;
  } else if (
    result.value &&
    typeof result.value === 'object' &&
    Array.isArray((result.value as { data?: unknown[] }).data)
  ) {
    raw = (result.value as { data: unknown[] }).data;
  }

  return raw
    .filter((r): r is BackendAppointmentRaw => r !== null && typeof r === 'object')
    .map((r): NotificationAppointment => ({
      id: String(r.id ?? ''),
      patient_name: String(r.patientName ?? r.patient_name ?? 'Paciente'),
      scheduled_at: String(r.scheduledAt ?? r.scheduled_at ?? new Date().toISOString()),
      plan_name: (r.planName ?? r.plan_name ?? null) as string | null,
      plan_price: (r.planPrice ?? r.plan_price ?? null) as number | null,
    }));
}
