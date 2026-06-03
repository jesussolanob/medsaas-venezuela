'use server';

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
 *   GET  /api/patients?page=&limit=&source=  → list (paginated, masked)
 *   POST /api/patients                        → create
 *   GET  /api/patients/:id                   → get one (masked)
 *   PUT  /api/patients/:id                   → update
 *   DELETE /api/patients/:id                 → soft delete (unused by UI yet)
 *   GET  /api/patients/:id/reveal            → reveal PII
 *
 *   GET  /api/consultations?patient_id=&page=&limit= → list consultations
 *   POST /api/consultations                          → create consultation
 *   PUT  /api/consultations/:id                      → update consultation
 *
 * No backend equivalent (skipped for now):
 *   - getDoctorId()  — derived from dev-auth stub
 *   - patient_packages read (separate module, still on Supabase)
 */

import { revalidatePath } from 'next/cache';
import { getDevUser } from '@/lib/dev-auth';
import { backendGet, backendPost, backendPut, type AppError } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types — kept compatible with the existing UI
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

// Backend shape (camelCase) returned by NestJS mapper — list item
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

// Backend shape (camelCase) — full detail
interface BackendPatientDetail extends BackendPatientListItem {
  authUserId: string | null;
  birthDate: string | null;
  age: number | null;
  sex: string | null;
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  address: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  updatedAt: string;
}

// Backend consultation shape — the consultation mapper returns snake_case
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
// Mappers — backend camelCase → frontend snake_case
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

function mapDetailToPatient(detail: BackendPatientDetail): Patient {
  return {
    id: detail.id,
    doctor_id: detail.doctorId,
    full_name: detail.fullName,
    age: detail.age,
    phone: detail.phone,
    cedula: detail.cedula,
    email: detail.email,
    sex: detail.sex,
    notes: detail.notes,
    source: detail.source,
    auth_user_id: detail.authUserId,
    birth_date: detail.birthDate,
    address: detail.address,
    city: detail.city,
    blood_type: detail.bloodType,
    allergies: detail.allergies,
    chronic_conditions: detail.chronicConditions,
    emergency_contact_name: detail.emergencyContactName,
    emergency_contact_phone: detail.emergencyContactPhone,
    avatar_url: null,
    created_at: detail.createdAt,
  };
}

// The consultation mapper already returns snake_case — direct pass-through.
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

function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

// ---------------------------------------------------------------------------
// Doctor identity — derived from dev-auth stub (replaces supabase.auth.getUser)
// ---------------------------------------------------------------------------

/**
 * Returns the current doctor's id from the dev-auth stub.
 * In Etapa 2, this is replaced by the Auth0 session.
 */
export async function getDoctorId(): Promise<string | null> {
  const user = await getDevUser();
  return user.id;
}

// ---------------------------------------------------------------------------
// Patients CRUD
// ---------------------------------------------------------------------------

/** Fetch all patients for the authenticated doctor. Returns up to 200 records. */
export async function getPatients(_doctorId: string): Promise<Patient[]> {
  // doctorId param kept for API compatibility with the existing UI calls,
  // but the backend derives it from the auth header (anti-IDOR).
  // backendFetch unwraps the backend envelope { success, data, meta } and returns data.
  const result = await backendGet<BackendPatientListItem[]>('/api/patients?page=1&limit=200');

  if (!result.ok) {
    console.error('[getPatients]', result.error.message);
    return [];
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return items.map(mapListItemToPatient);
}

// AddPatientInput — superset of fields the UI may pass
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

/** Create a new patient for the authenticated doctor. */
export async function addPatient(
  _doctorId: string,
  input: AddPatientInput,
): Promise<AddPatientResult> {
  const doctorId = await getDoctorId();

  // backend CreatePatientDtoSchema requires doctor_id
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

/** Fetch consultations for a patient. */
export async function getConsultations(patientId: string): Promise<Consultation[]> {
  // Backend endpoint: GET /api/consultations/patient/:patientId (DDD module)
  const result = await backendGet<BackendConsultation[]>(
    `/api/consultations/patient/${patientId}?page=1&limit=100`,
  );

  if (!result.ok) {
    console.error('[getConsultations]', result.error.message);
    return [];
  }

  const raw = result.value;
  const items: BackendConsultation[] = Array.isArray(raw) ? raw : [];
  return items.map(mapConsultation);
}

// CreateConsultationInput — mirrors the existing type
export type CreateConsultationInput = {
  patient_id: string;
  chief_complaint?: string;
  notes?: string;
  diagnosis?: string;
  treatment?: string;
  payment_status?: 'pending' | 'approved';
};

export async function createConsultation(
  _doctorId: string,
  input: CreateConsultationInput,
): Promise<ActionResult & { code?: string }> {
  // CreateConsultationBodyDtoSchema requires patient_id + consultation_date (ISO).
  // diagnosis and treatment are set via a subsequent PUT call (update consultation).
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

/** Update a patient's fields. doctor_id ownership is verified server-side (anti-IDOR). */
export async function updatePatient(
  patientId: string,
  _doctorId: string,
  input: UpdatePatientInput,
): Promise<ActionResult> {
  // Build the body — only include defined keys (partial update)
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
// Reveal PII
// ---------------------------------------------------------------------------

/** Fetch the full unmasked patient record. Inserts an audit log row server-side. */
export async function revealPatient(patientId: string): Promise<Patient | null> {
  const result = await backendGet<BackendPatientDetail>(`/api/patients/${patientId}/reveal`);

  if (!result.ok) {
    console.error('[revealPatient]', result.error.message);
    return null;
  }

  return mapDetailToPatient(result.value);
}

// ---------------------------------------------------------------------------
// All consultations (for the doctor's consultations module, kept for compat)
// ---------------------------------------------------------------------------

export async function getAllConsultationsForDoctor(
  _doctorId: string,
): Promise<(Consultation & { patient_name: string })[]> {
  const result = await backendGet<BackendConsultation[]>('/api/consultations?page=1&limit=500');

  if (!result.ok) {
    console.error('[getAllConsultationsForDoctor]', result.error.message);
    return [];
  }

  const raw = result.value;
  const items = Array.isArray(raw) ? raw : [];
  // patient_name is not included in the backend response for this endpoint —
  // callers that need it should fetch the patient separately.
  return items.map((c) => ({
    ...mapConsultation(c),
    patient_name: 'Paciente',
  }));
}
