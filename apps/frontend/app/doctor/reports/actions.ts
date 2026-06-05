'use server';

/**
 * app/doctor/reports/actions.ts
 *
 * Server actions for the doctor reports page (page.tsx).
 * Replaces all Supabase reads (consultations + join, patients) with calls to
 * the NestJS backend via api-client.server.
 *
 * ETAPA 1: DevAuthGuard headers.
 * ETAPA 2 (Auth0): Replace getDevUser() in countFromEndpoint only.
 *
 * Endpoints consumed:
 *   GET /api/consultations?limit=500   → consultation list (snake_case fields)
 *   GET /api/patients?limit=200        → patient list for name/cedula lookup (masked)
 *
 * Field mapping notes:
 *   - patient_name: joined from patients list by patient_id (masked in list view).
 *   - patient_cedula: from masked patients list (e.g. "123***45") — no reveal needed
 *     for CSV export of reports.
 *   - duration_minutes: NOT available in backend (Supabase-only column).
 *     Defaulted to 30 min to match the old fallback. TODO: add to consultations table.
 *   - status / no-show detection: consultations have payment_status (pending|approved),
 *     not an attendance status. No-show approximation: payment_status='pending' AND
 *     consultation_date is in the past. This is an approximation until the backend
 *     exposes appointment.status joined to the consultation.
 *
 * Retention calculation:
 *   - Computed client-side from the full consultation list (no extra endpoint needed).
 *   - A patient is "returning" if they appear in 2+ consultations.
 *
 * PDF/storage export: NOT migrated here (depends on storage module, Fase 5).
 * CSV export: handled entirely client-side in page.tsx (no server action needed).
 */

import 'server-only';

import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Consultation record shape expected by the reports page JSX. */
export interface ReportConsultationRecord {
  id: string;
  consultation_code: string;
  patient_name: string;
  patient_cedula: string | undefined;
  chief_complaint: string;
  payment_method: string;
  amount: number;
  consultation_date: string;
  /**
   * Approximated status for no-show rate calculation.
   * 'no_show' when payment_status='pending' AND date is past; otherwise 'completed'.
   * This is an approximation — the backend does not join appointment.status here.
   */
  status: string;
  payment_status: string | undefined;
  /**
   * Duration in minutes. Always 30 — not available in the backend.
   * TODO: add duration_minutes column to consultations table.
   */
  duration_minutes: number;
  patient_id: string | undefined;
}

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

/** Consultation item as returned by GET /api/consultations (snake_case). */
interface BackendConsultation {
  id: string;
  consultation_code: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  payment_status: string | null;
  payment_method: string | null;
  amount: number | null;
  payment_date: string | null;
  consultation_date: string;
  created_at: string;
  updated_at: string;
}

/** Patient list item as returned by GET /api/patients (camelCase). */
interface BackendPatientListItem {
  id: string;
  fullName: string;
  cedula: string | null;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

/**
 * Fetch all consultations for the reports page.
 * Joins patient name and cedula from the patients list.
 *
 * Limit of 500 consultations covers all reasonable single-doctor practice volumes.
 */
export async function getReportConsultations(): Promise<ReportConsultationRecord[]> {
  // Fetch consultations and patients in parallel.
  const [consultationsResult, patientsResult] = await Promise.all([
    backendGet<BackendConsultation[]>('/api/consultations?page=1&limit=500'),
    backendGet<BackendPatientListItem[]>('/api/patients?page=1&limit=200'),
  ]);

  if (!consultationsResult.ok) {
    log.error('[getReportConsultations] consultations backend error', {
      code: consultationsResult.error.code,
      status: consultationsResult.error.status,
    });
    return [];
  }

  // Build a lookup map from patient_id → { name, cedula } for O(1) join.
  const patientMap = new Map<string, { name: string; cedula: string | null }>();
  if (patientsResult.ok) {
    const patients = Array.isArray(patientsResult.value) ? patientsResult.value : [];
    for (const p of patients) {
      patientMap.set(p.id, { name: p.fullName, cedula: p.cedula });
    }
  } else {
    log.error('[getReportConsultations] patients backend error — names will be missing', {
      code: patientsResult.error.code,
      status: patientsResult.error.status,
    });
  }

  const consultations = Array.isArray(consultationsResult.value) ? consultationsResult.value : [];
  const now = new Date();

  return consultations
    .sort(
      (a, b) =>
        new Date(b.consultation_date).getTime() - new Date(a.consultation_date).getTime(),
    )
    .map((c): ReportConsultationRecord => {
      const patient = c.patient_id ? patientMap.get(c.patient_id) : undefined;
      const isPastAndUnpaid =
        c.payment_status !== 'approved' && new Date(c.consultation_date) < now;

      return {
        id: c.id,
        consultation_code: c.consultation_code,
        patient_name: patient?.name ?? 'Paciente desconocido',
        patient_cedula: patient?.cedula ?? undefined,
        chief_complaint: c.chief_complaint ?? '',
        payment_method: c.payment_method ?? 'No especificado',
        amount: Number(c.amount) || 0,
        consultation_date: c.consultation_date,
        // Approximate no-show: past consultation with pending payment.
        status: isPastAndUnpaid ? 'no_show' : 'completed',
        payment_status: c.payment_status ?? undefined,
        // duration_minutes not available in backend — default 30 min.
        duration_minutes: 30,
        patient_id: c.patient_id ?? undefined,
      };
    });
}
