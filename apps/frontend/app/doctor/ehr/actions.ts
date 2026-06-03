'use server';

/**
 * app/doctor/ehr/actions.ts
 *
 * Server Actions for the EHR (Electronic Health Record) module.
 *
 * ETAPA 1 — thin-proxy to the NestJS backend via api-client.server.
 * The existing UI (page.tsx) calls Supabase directly via createClient() and
 * is NOT connected to these actions yet — migration of the UI is deferred to
 * the next sprint. These actions are ready to be imported once the page is
 * updated.
 *
 * Backend endpoints:
 *   GET  /api/ehr/patient/:patientId  → patient EHR history
 *   GET  /api/ehr/:id                 → single EHR record
 *   POST /api/ehr                     → create record
 *   PUT  /api/ehr/:id                 → update diagnosis / treatment_plan
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { backendGet, backendPost, backendPut, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types — snake_case to match the backend mapper output
// ---------------------------------------------------------------------------

export type EhrRecord = {
  id: string;
  doctor_id: string;
  patient_id: string;
  consultation_id: string | null;
  diagnosis: string | null;
  treatment_plan: string | null;
  created_at: string;
  updated_at: string;
};

export type EhrActionResult = { success: true } | { success: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

// ---------------------------------------------------------------------------
// EHR CRUD
// ---------------------------------------------------------------------------

/** Fetch all EHR records for a patient. */
export async function getPatientEhr(patientId: string): Promise<EhrRecord[]> {
  const result = await backendGet<EhrRecord[]>(`/api/ehr/patient/${patientId}`);

  if (!result.ok) {
    log.error('[getPatientEhr] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/** Fetch a single EHR record. */
export async function getEhrRecord(ehrId: string): Promise<EhrRecord | null> {
  const result = await backendGet<EhrRecord>(`/api/ehr/${ehrId}`);

  if (!result.ok) {
    log.error('[getEhrRecord] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

/** Create a new EHR record. doctor_id is derived from auth header (anti-IDOR). */
export async function createEhrRecord(input: {
  patient_id: string;
  consultation_id?: string | null;
  diagnosis?: string | null;
  treatment_plan?: string | null;
}): Promise<EhrActionResult & { record?: EhrRecord }> {
  const result = await backendPost<EhrRecord>('/api/ehr', {
    patient_id: input.patient_id,
    consultation_id: input.consultation_id ?? null,
    diagnosis: input.diagnosis ?? null,
    treatment_plan: input.treatment_plan ?? null,
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/ehr');
  return { success: true, record: result.value };
}

/** Update diagnosis and/or treatment_plan on an EHR record. */
export async function updateEhrRecord(
  ehrId: string,
  fields: {
    diagnosis?: string | null;
    treatment_plan?: string | null;
  },
): Promise<EhrActionResult & { record?: EhrRecord }> {
  const result = await backendPut<EhrRecord>(`/api/ehr/${ehrId}`, fields);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/ehr');
  return { success: true, record: result.value };
}
