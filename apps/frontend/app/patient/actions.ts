'use server';

/**
 * app/patient/actions.ts
 *
 * Server Actions for the patient portal.
 *
 * ETAPA 1 — thin-proxy to the NestJS backend via api-client.server (BFF).
 * Replaces the previous direct Supabase queries in the patient .tsx files.
 * The backend derives the access scope from `user.sub` (auth_user_id) injected
 * by DevAuthGuard — never from path params or body (anti-IDOR).
 *
 * Backend endpoints (all under /api):
 *   GET  /api/patient/dashboard      → next appointment + active packages + total count
 *   GET  /api/patient/appointments   → paginated appointment history
 *   GET  /api/patient/packages       → packages (?status=active)
 *   GET  /api/patient/prescriptions  → prescriptions (medication/dosage decrypted)
 *   GET  /api/patient/profile        → patient profile rows
 *   PUT  /api/patient/profile        → update profile (ONLY address/city/notes)
 *
 * DEFERRED — Fase 5 (no backend endpoint yet):
 *   - clinical reports exposure to the patient (consultations notes/diagnosis)
 *   - shared health space (shared_files), realtime, storage uploads
 *   - full profile field updates (cedula/phone/birth_date/sex/blood_type/...)
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { backendGet, backendPut, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types — mirror the backend patient-portal response shapes (camelCase).
// ---------------------------------------------------------------------------

export interface PatientAppointmentSummary {
  id: string;
  scheduledAt: string;
  status: string;
  appointmentMode: string;
  planName: string | null;
  doctorId: string;
  doctorName: string | null;
}

export interface PatientPackageSummary {
  id: string;
  planName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: string;
  doctorId: string;
  doctorName: string | null;
  bookingLink: string | null;
}

export interface PatientDashboardData {
  nextAppointment: PatientAppointmentSummary | null;
  activePackages: PatientPackageSummary[];
  totalAppointments: number;
}

export interface PatientAppointmentItem {
  id: string;
  doctorId: string;
  scheduledAt: string;
  status: string;
  appointmentMode: string;
  planName: string | null;
  planPrice: number | null;
  paymentMethod: string | null;
  chiefComplaint: string | null;
  appointmentCode: string | null;
  packageId: string | null;
  sessionNumber: number | null;
  createdAt: string;
}

export interface PatientPrescriptionItem {
  id: string;
  patientId: string | null;
  doctorId: string;
  consultationId: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PatientProfileItem {
  id: string;
  doctorId: string;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  sex: 'male' | 'female' | 'other' | null;
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  address: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  createdAt: string;
}

export type PatientActionResult = { success: true } | { success: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: { total: number; page: number; limit: number };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Patient dashboard: next appointment, active packages, total appointment count. */
export async function getPatientDashboard(): Promise<PatientDashboardData> {
  const result = await backendGet<Envelope<PatientDashboardData>>('/api/patient/dashboard');

  if (!result.ok) {
    log.error('[getPatientDashboard] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { nextAppointment: null, activePackages: [], totalAppointments: 0 };
  }

  return result.value.data ?? { nextAppointment: null, activePackages: [], totalAppointments: 0 };
}

/** Patient appointment history (paginated, newest first). */
export async function getPatientAppointments(opts?: {
  page?: number;
  limit?: number;
}): Promise<PatientAppointmentItem[]> {
  const qs = new URLSearchParams({
    page: String(opts?.page ?? 1),
    limit: String(opts?.limit ?? 100),
  });

  const result = await backendGet<Envelope<PatientAppointmentItem[]>>(
    `/api/patient/appointments?${qs.toString()}`,
  );

  if (!result.ok) {
    log.error('[getPatientAppointments] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value.data) ? result.value.data : [];
}

/** Patient prescriptions (medication/dosage already decrypted server-side). */
export async function getPatientPrescriptions(): Promise<PatientPrescriptionItem[]> {
  const result = await backendGet<Envelope<PatientPrescriptionItem[]>>(
    '/api/patient/prescriptions',
  );

  if (!result.ok) {
    log.error('[getPatientPrescriptions] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value.data) ? result.value.data : [];
}

/** Patient profile rows (one per doctor where the patient is registered). */
export async function getPatientProfile(): Promise<PatientProfileItem[]> {
  const result = await backendGet<Envelope<PatientProfileItem[]>>('/api/patient/profile');

  if (!result.ok) {
    log.error('[getPatientProfile] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value.data) ? result.value.data : [];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Update the patient profile.
 *
 * NOTE: the backend only persists address/city/notes today. Other fields
 * (cedula/phone/birth_date/sex/blood_type/allergies/...) are DEFERRED to Fase 5
 * (they require a dedicated patient-facing update use case). The form keeps
 * showing them, but only these three are sent.
 */
export async function updatePatientProfile(input: {
  patientId: string;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
}): Promise<PatientActionResult> {
  const result = await backendPut<Envelope<unknown>>('/api/patient/profile', {
    patient_id: input.patientId,
    address: input.address ?? null,
    city: input.city ?? null,
    notes: input.notes ?? null,
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/patient/profile');
  return { success: true };
}
