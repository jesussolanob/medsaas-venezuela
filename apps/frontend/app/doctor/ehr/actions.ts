'use server';

/**
 * app/doctor/ehr/actions.ts
 *
 * Server Actions for the EHR (Electronic Health Record) module.
 * ETAPA 1 — thin-proxy to the NestJS backend via api-client.server.
 *
 * Backend endpoints consumed:
 *   GET  /api/patients?page=1&limit=200       → patients list (for EHR patient selector)
 *   GET  /api/consultations/patient/:id       → patient consultation history
 *   GET  /api/prescriptions/patient/:id       → patient prescriptions
 *   GET  /api/ehr/patient/:id                 → patient EHR records
 *   GET  /api/ehr/:id                         → single EHR record
 *   POST /api/ehr                             → create EHR record
 *   PUT  /api/ehr/:id                         → update diagnosis / treatment_plan
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { getDevUser } from '@/lib/dev-auth';
import { backendGet, backendPost, backendPut, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal patient shape needed by the EHR patient selector. */
export type EhrPatient = {
  id: string;
  full_name: string;
  phone: string | null;
  age: number | null;
  sex: string | null;
  id_number: string | null; // alias of cedula — kept for UI compat
  created_at: string;
};

export type EhrConsultation = {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  payment_status: string;
};

export type EhrPrescription = {
  id: string;
  patient_id: string;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  created_at: string;
};

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

// Backend patient list shape (camelCase from patients mapper)
interface BackendPatientItem {
  id: string;
  doctorId: string;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  createdAt: string;
}

// Backend consultation shape (snake_case from consultations mapper)
interface BackendConsultation {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  payment_status: string;
}

// Backend prescription shape (snake_case from prescriptions mapper)
interface BackendPrescription {
  id: string;
  patient_id: string;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

// ---------------------------------------------------------------------------
// Identity (replaces supabase.auth.getUser in the EHR page)
// ---------------------------------------------------------------------------

/** Returns the current doctor's id. Called by the UI for local state. */
export async function getDoctorId(): Promise<string | null> {
  const user = await getDevUser();
  return user.id;
}

// ---------------------------------------------------------------------------
// Patients list (for the EHR patient selector)
// ---------------------------------------------------------------------------

/**
 * Fetch patients for the EHR patient selector.
 * Returns all patients — the UI filters to those with at least one consultation.
 * Backend: GET /api/patients?page=1&limit=200
 */
export async function getEhrPatients(): Promise<EhrPatient[]> {
  const result = await backendGet<BackendPatientItem[]>('/api/patients?page=1&limit=200');

  if (!result.ok) {
    log.error('[getEhrPatients] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return items.map((p) => ({
    id: p.id,
    full_name: p.fullName,
    phone: p.phone,
    age: null, // not returned in list shape; detail only
    sex: null, // not returned in list shape
    id_number: p.cedula, // cedula is the id_number alias
    created_at: p.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Consultations for a patient (EHR view)
// ---------------------------------------------------------------------------

export async function getEhrConsultations(patientId: string): Promise<EhrConsultation[]> {
  const result = await backendGet<BackendConsultation[]>(
    `/api/consultations/patient/${patientId}?page=1&limit=100`,
  );

  if (!result.ok) {
    log.error('[getEhrConsultations] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return items.map((c) => ({
    id: c.id,
    consultation_code: c.consultation_code,
    consultation_date: c.consultation_date,
    chief_complaint: c.chief_complaint,
    notes: c.notes,
    diagnosis: c.diagnosis,
    treatment: c.treatment,
    payment_status: c.payment_status,
  }));
}

// ---------------------------------------------------------------------------
// Prescriptions for a patient (EHR view)
// ---------------------------------------------------------------------------

export async function getEhrPrescriptions(patientId: string): Promise<EhrPrescription[]> {
  const result = await backendGet<BackendPrescription[]>(`/api/prescriptions/patient/${patientId}`);

  if (!result.ok) {
    log.error('[getEhrPrescriptions] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return items.map((rx) => ({
    id: rx.id,
    patient_id: rx.patient_id,
    medication: rx.medication,
    dosage: rx.dosage,
    frequency: rx.frequency,
    duration: rx.duration,
    created_at: rx.created_at,
  }));
}

// ---------------------------------------------------------------------------
// EHR records CRUD
// ---------------------------------------------------------------------------

/** Fetch EHR records for a patient. */
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

/** Create a new EHR record. */
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
  fields: { diagnosis?: string | null; treatment_plan?: string | null },
): Promise<EhrActionResult & { record?: EhrRecord }> {
  const result = await backendPut<EhrRecord>(`/api/ehr/${ehrId}`, fields);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/ehr');
  return { success: true, record: result.value };
}
