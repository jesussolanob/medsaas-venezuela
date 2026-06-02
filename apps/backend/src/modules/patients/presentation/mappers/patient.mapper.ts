import type { Patient } from '../../domain/entities/patient.entity';

/**
 * Presentation-layer mapper for patient data.
 *
 * MASKING RULE: PII masking happens here — never in the repository or use cases.
 * Reference: 00-estructura-modulo.md "El masking lo aplica el mapper en la capa
 * de presentación, nunca el repositorio."
 *
 * TWO SHAPES:
 *   PatientListItem  — minimal fields for list responses; no clinical data.
 *   PatientDetail    — all fields for GET /:id (masked) and GET /:id/reveal (plaintext).
 *
 * Masked formats:
 *   full_name → "Juan P."
 *   cedula    → "V-123***78"
 *   phone     → "+584***567"
 *   email     → "j***@gmail.com"
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

/** Returns a minimal masked object suitable for paginated list responses. */
export function toPatientListItem(patient: Patient): PatientListItem {
  return {
    id: patient.id,
    doctorId: patient.doctorId,
    fullName: maskName(patient.fullName),
    cedula: patient.cedula ? maskCedula(patient.cedula) : null,
    phone: patient.phone ? maskPhone(patient.phone) : null,
    email: patient.email ? maskEmail(patient.email) : null,
    source: patient.source,
    createdAt: patient.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Detail shape — all fields, used for GET /:id (masked) and GET /:id/reveal (plaintext)
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
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Returns a full masked detail object for GET /:id responses. */
export function toPatientDetail(patient: Patient): PatientDetail {
  return {
    id: patient.id,
    doctorId: patient.doctorId,
    authUserId: patient.authUserId,
    fullName: maskName(patient.fullName),
    cedula: patient.cedula ? maskCedula(patient.cedula) : null,
    phone: patient.phone ? maskPhone(patient.phone) : null,
    email: patient.email ? maskEmail(patient.email) : null,
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
    notes: patient.notes,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}

/** Returns a full plaintext detail object for GET /:id/reveal responses. */
export function toPatientReveal(patient: Patient): PatientDetail {
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
    notes: patient.notes,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Masking helpers
// ---------------------------------------------------------------------------

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? name;
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const lastInitial = lastPart ? ` ${lastPart[0]}.` : '';
  return `${first}${lastInitial}`;
}

function maskCedula(cedula: string): string {
  const prefix = /^[VvEe]-?/.exec(cedula)?.[0] ?? '';
  const digits = cedula.slice(prefix.length);
  if (digits.length <= 4) return cedula;
  return `${prefix}${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  return `${local[0] ?? ''}***@${domain}`;
}
