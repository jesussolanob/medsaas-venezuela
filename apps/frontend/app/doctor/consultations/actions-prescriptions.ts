'use server';

/**
 * app/doctor/consultations/actions-prescriptions.ts
 *
 * Server Actions for the Prescriptions sub-module (under consultations).
 *
 * ETAPA 1 — thin-proxy to the NestJS backend via api-client.server.
 * The existing UI (consultations/page.tsx) calls Supabase directly via
 * createClient() and is NOT connected to these actions yet — migration of
 * the UI is deferred to the next sprint. These actions are ready to be
 * imported once the page is updated.
 *
 * Backend endpoints:
 *   GET  /api/prescriptions/patient/:patientId → patient prescription list
 *   GET  /api/prescriptions/:id               → single prescription
 *   POST /api/prescriptions                   → emit a new prescription
 *
 * DEFERRED — Fase 5:
 *   GET /api/prescriptions/:id/pdf — requires doctor_templates table
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { backendGet, backendPost, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types — snake_case, matches the backend mapper output
// ---------------------------------------------------------------------------

export type Prescription = {
  id: string;
  doctor_id: string;
  patient_id: string;
  consultation_id: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  issued_date: string; // alias of created_at
  created_at: string;
  updated_at: string;
};

export type PrescriptionActionResult =
  | { success: true; prescription: Prescription }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

/** Fetch all prescriptions for a patient owned by the authenticated doctor. */
export async function getPatientPrescriptions(patientId: string): Promise<Prescription[]> {
  const result = await backendGet<Prescription[]>(`/api/prescriptions/patient/${patientId}`);

  if (!result.ok) {
    log.error('[getPatientPrescriptions] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/** Fetch a single prescription. */
export async function getPrescription(prescriptionId: string): Promise<Prescription | null> {
  const result = await backendGet<Prescription>(`/api/prescriptions/${prescriptionId}`);

  if (!result.ok) {
    log.error('[getPrescription] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

/**
 * Emit a new prescription for a patient.
 * doctor_id is derived from the x-dev-user-id header (anti-IDOR).
 */
export async function createPrescription(input: {
  patient_id: string;
  consultation_id?: string | null;
  medication: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string | null;
}): Promise<PrescriptionActionResult> {
  const result = await backendPost<Prescription>('/api/prescriptions', {
    patient_id: input.patient_id,
    consultation_id: input.consultation_id ?? null,
    medication: input.medication,
    dosage: input.dosage ?? null,
    frequency: input.frequency ?? null,
    duration: input.duration ?? null,
    notes: input.notes ?? null,
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/consultations');
  revalidatePath('/doctor/ehr');
  return { success: true, prescription: result.value };
}
