'use server';

import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReminderItem {
  id: string;
  /** 'consultation' → id is a consultation UUID; 'appointment' → id is appt-<uuid> */
  source: 'consultation' | 'appointment';
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  plan_name: string | null;
}

// Shape returned by GET /api/consultations/with-patient (unwrapped from envelope)
interface ConsultationWithPatientItem {
  id: string;
  consultation_code: string;
  consultation_date: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
}

// Minimal shape we read from GET /api/appointments (list — masked PII for IDs only)
interface AppointmentListItem {
  id: string;
  scheduledAt?: string;
  scheduled_at?: string;
  status: string;
  appointmentCode?: string;
  appointment_code?: string;
}

// Shape returned by GET /api/appointments/:id (full PII, unmasked)
interface AppointmentDetail {
  id: string;
  scheduledAt?: string;
  scheduled_at?: string;
  status: string;
  appointmentCode?: string;
  appointment_code?: string;
  patientId?: string;
  patient_id?: string;
  patientName?: string;
  patient_name?: string;
  patientPhone?: string;
  patient_phone?: string;
  patientEmail?: string;
  patient_email?: string;
  planName?: string;
  plan_name?: string;
  chiefComplaint?: string;
  chief_complaint?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scheduledAt(appt: AppointmentDetail | AppointmentListItem): string {
  return (appt as AppointmentDetail).scheduledAt ?? (appt as AppointmentDetail).scheduled_at ?? '';
}

function appointmentCode(appt: AppointmentDetail): string {
  return appt.appointmentCode ?? appt.appointment_code ?? appt.id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Server action: fetch upcoming consultations with patient PII
// ---------------------------------------------------------------------------

/**
 * Fetches upcoming consultations (from today) with decrypted patient contact
 * data for the authenticated doctor. Uses GET /api/consultations/with-patient.
 *
 * Date filtering is done in-app because the endpoint does not accept
 * a date_from param — it returns the most recent `limit` consultations.
 */
export async function getUpcomingConsultations(): Promise<ReminderItem[]> {
  const result = await backendGet<ConsultationWithPatientItem[]>(
    '/api/consultations/with-patient?limit=100',
  );

  if (!result.ok) {
    log.error('[getUpcomingConsultations] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  return items
    .filter((c) => new Date(c.consultation_date).getTime() >= todayMs)
    .map(
      (c): ReminderItem => ({
        id: c.id,
        source: 'consultation',
        consultation_code: c.consultation_code,
        consultation_date: c.consultation_date,
        chief_complaint: null,
        patient_id: c.patient_id,
        patient_name: c.patient_name,
        patient_phone: c.patient_phone,
        patient_email: c.patient_email,
        plan_name: null,
      }),
    );
}

// ---------------------------------------------------------------------------
// Server action: fetch upcoming appointments (scheduled + confirmed) with PII
// ---------------------------------------------------------------------------

/**
 * Fetches upcoming scheduled/confirmed appointments enriched with full patient
 * contact data (phone, email) for reminder sending.
 *
 * Strategy:
 *   1. GET /api/appointments?status=scheduled&date_from=<today>&limit=50
 *      GET /api/appointments?status=confirmed&date_from=<today>&limit=50
 *      → gives IDs and scheduledAt (PII is masked in list responses)
 *   2. GET /api/appointments/:id (parallel) → full PII (unmasked, ownership enforced)
 *
 * The two-step approach is intentional: the list endpoint enforces masking per
 * the security policy; the detail endpoint provides full owner-scoped PII.
 */
export async function getUpcomingAppointments(): Promise<ReminderItem[]> {
  const todayIso = new Date().toISOString();

  const [scheduledResult, confirmedResult] = await Promise.all([
    backendGet<AppointmentListItem[]>(
      `/api/appointments?status=scheduled&date_from=${encodeURIComponent(todayIso)}&limit=50`,
    ),
    backendGet<AppointmentListItem[]>(
      `/api/appointments?status=confirmed&date_from=${encodeURIComponent(todayIso)}&limit=50`,
    ),
  ]);

  const listItems: AppointmentListItem[] = [];

  if (scheduledResult.ok) {
    const raw = scheduledResult.value;
    if (Array.isArray(raw)) listItems.push(...raw);
  } else {
    log.error('[getUpcomingAppointments] scheduled fetch error', {
      code: scheduledResult.error.code,
      status: scheduledResult.error.status,
    });
  }

  if (confirmedResult.ok) {
    const raw = confirmedResult.value;
    if (Array.isArray(raw)) listItems.push(...raw);
  } else {
    log.error('[getUpcomingAppointments] confirmed fetch error', {
      code: confirmedResult.error.code,
      status: confirmedResult.error.status,
    });
  }

  if (listItems.length === 0) return [];

  // Deduplicate by id (in case an item appears in both lists — unlikely but safe)
  const uniqueIds = [...new Set(listItems.map((a) => a.id))];

  // Parallel individual fetches for full PII (unmasked, owner-scoped)
  const detailResults = await Promise.all(
    uniqueIds.map((id) => backendGet<AppointmentDetail>(`/api/appointments/${id}`)),
  );

  const items: ReminderItem[] = [];

  for (const detailResult of detailResults) {
    if (!detailResult.ok) {
      log.error('[getUpcomingAppointments] detail fetch error', {
        code: detailResult.error.code,
        status: detailResult.error.status,
      });
      continue;
    }

    const a = detailResult.value;
    if (!a) continue;

    items.push({
      id: `appt-${a.id}`,
      source: 'appointment',
      consultation_code: appointmentCode(a),
      consultation_date: scheduledAt(a),
      chief_complaint: a.chiefComplaint ?? a.chief_complaint ?? null,
      patient_id: a.patientId ?? a.patient_id ?? null,
      patient_name: a.patientName ?? a.patient_name ?? 'Paciente',
      patient_phone: a.patientPhone ?? a.patient_phone ?? null,
      patient_email: a.patientEmail ?? a.patient_email ?? null,
      plan_name: a.planName ?? a.plan_name ?? null,
    });
  }

  return items;
}
