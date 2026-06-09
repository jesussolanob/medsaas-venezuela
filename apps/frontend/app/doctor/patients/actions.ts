'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/patients/actions.ts
 *
 * Server Actions for the doctor patients module.
 *
 * MIGRATED — Etapa 1: All Supabase calls removed. Data now comes from the
 * NestJS backend via the BFF client (lib/api-client.server.ts).
 *
 * The UI layer (page.tsx) imports these actions and expects the same
 * function signatures / return shapes as before — the mapping happens here.
 *
 * Backend endpoints consumed:
 *   GET    /api/patients?page=&limit=           → list (paginated, PII in plain to owner)
 *   POST   /api/patients                        → create
 *   PUT    /api/patients/:id                    → update
 *   GET    /api/consultations/patient/:id       → patient consultation history
 *   POST   /api/consultations                   → create consultation
 *   PUT    /api/consultations/:id               → update consultation fields
 *
 * Not yet migrated (no backend equivalent in Etapa 1):
 *   - patient_packages, pricing_plans  → separate modules, still Supabase
 *   - shared_files / storage           → Fase 5 (integrations)
 *
 * NOTE ON _doctorId PARAMETERS:
 *   Several functions keep a `_doctorId` parameter for compatibility with the
 *   existing UI (page.tsx calls getDoctorId() and passes the result). These
 *   parameters are intentionally ignored — the backend derives doctor_id from
 *   the x-dev-user-id header (anti-IDOR). They will be removed when the UI is
 *   updated in a future sprint.
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { resolveIdentity } from '@/lib/identity.server';
import { backendGet, backendPost, backendPut, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Pagination constants
// ---------------------------------------------------------------------------

const PATIENTS_PAGE_SIZE = 200; // Single-doctor list; backend max is 100 per request
const CONSULTATIONS_PAGE_SIZE = 100; // Per-patient history
const ALL_CONSULTATIONS_PAGE_SIZE = 500; // Doctor-wide list for reporting

// ---------------------------------------------------------------------------
// Public types — kept compatible with the existing UI
// ---------------------------------------------------------------------------

export type Patient = {
  id: string;
  doctor_id: string;
  full_name: string;
  age: number | null;
  phone: string | null;
  cedula: string | null;
  email: string | null;
  sex: string | null;
  notes: string | null;
  source: string | null;
  auth_user_id?: string | null;
  birth_date?: string | null;
  address?: string | null;
  city?: string | null;
  blood_type?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  avatar_url?: string | null;
  created_at: string;
};

export type Consultation = {
  id: string;
  consultation_code: string;
  patient_id: string;
  doctor_id: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  payment_status: 'pending' | 'approved';
  consultation_date: string;
  created_at: string;
};

export type ActionResult = { success: true } | { success: false; error: string };

export type AddPatientResult =
  | { success: true; patient_id: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Backend response shapes
// ---------------------------------------------------------------------------

// NestJS patients mapper returns camelCase
interface BackendPatientListItem {
  id: string;
  doctorId: string;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  createdAt: string;
}

// NestJS consultations mapper returns snake_case
interface BackendConsultation {
  id: string;
  consultation_code: string;
  patient_id: string;
  doctor_id: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  payment_status: 'pending' | 'approved';
  consultation_date: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapListItemToPatient(item: BackendPatientListItem): Patient {
  return {
    id: item.id,
    doctor_id: item.doctorId,
    full_name: item.fullName,
    age: null,
    phone: item.phone,
    cedula: item.cedula,
    email: item.email,
    sex: null,
    notes: null,
    source: item.source,
    auth_user_id: null,
    created_at: item.createdAt,
  };
}

// Consultation mapper already returns snake_case — direct pass-through.
function mapConsultation(c: BackendConsultation): Consultation {
  return {
    id: c.id,
    consultation_code: c.consultation_code,
    patient_id: c.patient_id,
    doctor_id: c.doctor_id,
    chief_complaint: c.chief_complaint,
    notes: c.notes,
    diagnosis: c.diagnosis,
    treatment: c.treatment,
    payment_status: c.payment_status,
    consultation_date: c.consultation_date,
    created_at: c.created_at,
  };
}


// ---------------------------------------------------------------------------
// Doctor identity
// ---------------------------------------------------------------------------

/**
 * Returns the current doctor's id from the dev-auth stub.
 *
 * Called by the UI (page.tsx) for display/state. The id is also attached
 * automatically to every backend request via the x-dev-user-id header —
 * actions do NOT pass it to the backend explicitly.
 *
 * In Etapa 2 this is replaced by the Auth0 session.
 */
export async function getDoctorId(): Promise<string | null> {
  try {
    const user = await resolveIdentity();
    return user.id;
  } catch {
    // auth0 mode with no session — fail closed rather than propagating a 500.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Patients CRUD
// ---------------------------------------------------------------------------

/**
 * Fetch all patients for the authenticated doctor.
 *
 * @param _doctorId — kept for UI compatibility; ignored (backend derives
 *   doctor_id from x-dev-user-id header, anti-IDOR).
 */
export async function getPatients(_doctorId: string): Promise<Patient[]> {
  const result = await backendGet<BackendPatientListItem[]>(
    `/api/patients?page=1&limit=${PATIENTS_PAGE_SIZE}`,
  );

  if (!result.ok) {
    log.error('[getPatients] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return items.map(mapListItemToPatient);
}

export type AddPatientInput = {
  full_name: string;
  age?: number | null;
  birth_date?: string | null;
  phone?: string | null;
  cedula?: string | null;
  email?: string | null;
  sex?: string | null;
  notes?: string | null;
  source?: string | null;
  blood_type?: string | null;
  address?: string | null;
  city?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

/**
 * Create a new patient for the authenticated doctor.
 *
 * @param _doctorId — kept for UI compatibility; ignored (see note above).
 */
export async function addPatient(
  _doctorId: string,
  input: AddPatientInput,
): Promise<AddPatientResult> {
  // doctor_id is required by CreatePatientDtoSchema; backend overrides it with the
  // authenticated identity (anti-IDOR). Resolve per AUTH_MODE for consistency.
  let doctorId: string;
  try {
    ({ id: doctorId } = await resolveIdentity());
  } catch {
    return { success: false, error: 'No autenticado' };
  }

  const body = {
    doctor_id: doctorId,
    full_name: input.full_name,
    cedula: input.cedula ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    source: input.source ?? 'manual',
    birth_date: input.birth_date ?? null,
    age: input.age ?? null,
    sex: input.sex ?? null,
    auth_user_id: null,
  };

  const result = await backendPost<BackendPatientListItem>('/api/patients', body);
  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/patients');
  return { success: true, patient_id: result.value.id };
}

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------

/** Fetch consultation history for a specific patient. */
export async function getConsultations(patientId: string): Promise<Consultation[]> {
  const result = await backendGet<BackendConsultation[]>(
    `/api/consultations/patient/${patientId}?page=1&limit=${CONSULTATIONS_PAGE_SIZE}`,
  );

  if (!result.ok) {
    log.error('[getConsultations] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const raw = result.value;
  const items: BackendConsultation[] = Array.isArray(raw) ? raw : [];
  return items.map(mapConsultation);
}

export type CreateConsultationInput = {
  patient_id: string;
  chief_complaint?: string;
  notes?: string;
  diagnosis?: string;
  treatment?: string;
  payment_status?: 'pending' | 'approved';
};

/**
 * Create a new consultation for a patient.
 *
 * @param _doctorId — kept for UI compatibility; ignored (see note above).
 */
export async function createConsultation(
  _doctorId: string,
  input: CreateConsultationInput,
): Promise<ActionResult & { code?: string }> {
  // CreateConsultationBodyDtoSchema requires patient_id + consultation_date (ISO).
  // diagnosis and treatment are set via updateConsultationNotes after creation.
  const body = {
    patient_id: input.patient_id,
    consultation_date: new Date().toISOString(),
    chief_complaint: input.chief_complaint ?? null,
    notes: input.notes ?? null,
  };

  const result = await backendPost<{ id: string; consultation_code: string }>(
    '/api/consultations',
    body,
  );

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/patients');
  return { success: true, code: result.value.consultation_code };
}

/** Update payment status of a consultation. */
export async function updateConsultationStatus(
  consultationId: string,
  status: 'pending' | 'approved',
): Promise<ActionResult> {
  const result = await backendPut<unknown>(`/api/consultations/${consultationId}`, {
    payment_status: status,
  });

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/patients');
  return { success: true };
}

/** Update clinical notes on a consultation. */
export async function updateConsultationNotes(
  consultationId: string,
  fields: {
    notes?: string;
    diagnosis?: string;
    treatment?: string;
    chief_complaint?: string;
  },
): Promise<ActionResult> {
  const result = await backendPut<unknown>(`/api/consultations/${consultationId}`, fields);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/patients');
  return { success: true };
}

// ---------------------------------------------------------------------------
// UpdatePatient
// ---------------------------------------------------------------------------

export type UpdatePatientInput = {
  full_name?: string;
  age?: number | null;
  birth_date?: string | null;
  phone?: string | null;
  cedula?: string | null;
  email?: string | null;
  sex?: string | null;
  notes?: string | null;
  blood_type?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  address?: string | null;
  city?: string | null;
  source?: string | null;
};

/**
 * Update a patient's fields. Ownership is enforced server-side (anti-IDOR).
 *
 * @param _doctorId — kept for UI compatibility; ignored (see note above).
 */
export async function updatePatient(
  patientId: string,
  _doctorId: string,
  input: UpdatePatientInput,
): Promise<ActionResult> {
  // Build a partial body — only send fields that were explicitly provided.
  const body: Record<string, unknown> = {};
  if (input.full_name !== undefined) body.full_name = input.full_name;
  if (input.age !== undefined) body.age = input.age;
  if (input.birth_date !== undefined) body.birth_date = input.birth_date;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.cedula !== undefined) body.cedula = input.cedula;
  if (input.email !== undefined) body.email = input.email;
  if (input.sex !== undefined) body.sex = input.sex;
  if (input.notes !== undefined) body.notes = input.notes;
  if (input.blood_type !== undefined) body.blood_type = input.blood_type;
  if (input.allergies !== undefined) body.allergies = input.allergies;
  if (input.chronic_conditions !== undefined) body.chronic_conditions = input.chronic_conditions;
  if (input.emergency_contact_name !== undefined)
    body.emergency_contact_name = input.emergency_contact_name;
  if (input.emergency_contact_phone !== undefined)
    body.emergency_contact_phone = input.emergency_contact_phone;
  if (input.address !== undefined) body.address = input.address;
  if (input.city !== undefined) body.city = input.city;
  if (input.source !== undefined) body.source = input.source;

  const result = await backendPut<unknown>(`/api/patients/${patientId}`, body);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/patients');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Patient packages
// ---------------------------------------------------------------------------

interface BackendPatientPackage {
  id: string;
  patientId: string;
  planName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: string;
}

export type PatientPackageInfo = {
  patientId: string;
  pendingSessions: number;
  totalSessions: number;
  usedSessions: number;
};

/**
 * Fetch active packages for a specific patient.
 *
 * Maps backend shape { patientId, remainingSessions, ... } to the UI shape
 * { patientId, pendingSessions, totalSessions, usedSessions }.
 */
export async function getPatientPackages(patientId: string): Promise<PatientPackageInfo[]> {
  const result = await backendGet<BackendPatientPackage[]>(
    `/api/packages/doctor?patient_id=${patientId}&status=active`,
  );

  if (!result.ok) {
    log.error('[getPatientPackages] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return items.map((pkg) => ({
    patientId: pkg.patientId,
    pendingSessions: pkg.remainingSessions,
    totalSessions: pkg.totalSessions,
    usedSessions: pkg.usedSessions,
  }));
}

/**
 * Fetch active packages for ALL patients of the authenticated doctor.
 *
 * Calls GET /api/packages/doctor?status=active (no patient_id filter).
 * Returns a map keyed by patient_id for O(1) lookup in the patients list.
 */
export async function getAllActivePackages(): Promise<Record<string, PatientPackageInfo>> {
  const result = await backendGet<BackendPatientPackage[]>(
    '/api/packages/doctor?status=active',
  );

  if (!result.ok) {
    log.error('[getAllActivePackages] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return {};
  }

  const items = Array.isArray(result.value) ? result.value : [];
  const map: Record<string, PatientPackageInfo> = {};
  for (const pkg of items) {
    // If multiple active packages for one patient, keep the one with more sessions.
    const existing = map[pkg.patientId];
    if (!existing || pkg.remainingSessions > existing.pendingSessions) {
      map[pkg.patientId] = {
        patientId: pkg.patientId,
        pendingSessions: pkg.remainingSessions,
        totalSessions: pkg.totalSessions,
        usedSessions: pkg.usedSessions,
      };
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// All consultations — doctor-wide (kept for reporting compat)
// ---------------------------------------------------------------------------

/**
 * Fetch all consultations for the authenticated doctor across all patients.
 *
 * IMPORTANT: The backend does not include patient_name in the consultation
 * response. The returned `patient_name` field is always '' (empty string).
 * Callers that need the name must fetch it separately from GET /api/patients/:id.
 *
 * @param _doctorId — kept for UI compatibility; ignored (see note above).
 */
export async function getAllConsultationsForDoctor(
  _doctorId: string,
): Promise<(Consultation & { patient_name: string })[]> {
  const result = await backendGet<BackendConsultation[]>(
    `/api/consultations?page=1&limit=${ALL_CONSULTATIONS_PAGE_SIZE}`,
  );

  if (!result.ok) {
    log.error('[getAllConsultationsForDoctor] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const raw = result.value;
  const items = Array.isArray(raw) ? raw : [];
  return items.map((c) => ({ ...mapConsultation(c), patient_name: '' }));
}
