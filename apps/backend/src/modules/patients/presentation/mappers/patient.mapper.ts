import type { Patient } from '../../domain/entities/patient.entity';

/**
 * Presentation-layer mapper for patient data.
 *
 * PII POLICY (2026-06-09): All endpoints are owner-scoped — doctorId is always
 * taken from the authenticated token, never from the request body (anti-IDOR).
 * Because the owner is authenticated and transport is TLS + VPC, PII is returned
 * in plaintext to the owning doctor. Masking has been removed.
 *
 * TWO SHAPES:
 *   PatientListItem  — minimal fields for list responses; no clinical data.
 *   PatientDetail    — all fields for GET /:id (plaintext PII).
 *
 * Audit log: GET /:id inserts one access_audit_log row (fieldRevealed='full_record').
 * List and search endpoints do NOT insert audit rows.
 */

// ---------------------------------------------------------------------------
// List shape — minimal: no allergies, chronicConditions, notes, or other clinical fields
// ---------------------------------------------------------------------------

export interface PatientListItem {
  id: string;
  doctorId: string;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  createdAt: Date;
}

/** Returns a minimal plaintext object suitable for paginated list responses. */
export function toPatientListItem(patient: Patient): PatientListItem {
  return {
    id: patient.id,
    doctorId: patient.doctorId,
    fullName: patient.fullName,
    cedula: patient.cedula,
    phone: patient.phone,
    email: patient.email,
    source: patient.source,
    createdAt: patient.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Detail shape — all fields, plaintext PII for the owning doctor
// ---------------------------------------------------------------------------

export interface PatientDetail {
  id: string;
  doctorId: string;
  authUserId: string | null;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
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
  emergencyContactRelationship: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Returns a full plaintext detail object for GET /:id responses. */
export function toPatientDetail(patient: Patient): PatientDetail {
  return {
    id: patient.id,
    doctorId: patient.doctorId,
    authUserId: patient.authUserId,
    fullName: patient.fullName,
    cedula: patient.cedula,
    phone: patient.phone,
    email: patient.email,
    source: patient.source,
    birthDate: patient.birthDate,
    age: patient.age,
    sex: patient.sex,
    bloodType: patient.bloodType,
    allergies: patient.allergies,
    chronicConditions: patient.chronicConditions,
    address: patient.address,
    city: patient.city,
    emergencyContactName: patient.emergencyContactName,
    emergencyContactPhone: patient.emergencyContactPhone,
    emergencyContactRelationship: patient.emergencyContactRelationship,
    notes: patient.notes,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}
