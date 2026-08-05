import type { Appointment } from '../../domain/entities/appointment.entity';

/**
 * Presentation-layer mapper for appointment data.
 *
 * Masking is applied here — never in the repository or in use cases.
 * Rule: `00-estructura-modulo.md` — "El masking lo aplica el mapper en la
 * capa de presentación, nunca el repositorio."
 */

/**
 * Converts an Appointment domain entity to a plain serialisable object.
 *
 * This guarantees every field — including `consultationId` and `officeName` — is
 * present in the API JSON response regardless of how the runtime serialises class
 * instances. Using a plain object avoids any NestJS / class-transformer filtering.
 *
 * FULL PII NOTE: This mapper does NOT mask PII. It is used for:
 *   1. GET /api/appointments/:id  — single appointment detail (owner-scoped, ADR-005).
 *   2. POST /api/appointments     — the created appointment for the owning doctor.
 * The LIST endpoint (GET /api/appointments) applies maskAppointmentPii() first.
 *
 * The `officeName` field is only populated when the query used a JOIN with doctor_offices
 * (i.e. findByIdScopedEnriched). It is null in all other paths.
 *
 * No audit log is required for this endpoint — it is owner access, not a /reveal
 * of masked data (same precedent as ADR-005 consultation billing view).
 */
export function toPlainAppointment(appt: Appointment): Record<string, unknown> {
  return {
    id: appt.id,
    doctorId: appt.doctorId,
    patientId: appt.patientId,
    authUserId: appt.authUserId,
    consultationId: appt.consultationId,
    patientName: appt.patientName,
    /** Full PII — only returned for owner-scoped single-appointment detail. */
    patientPhone: appt.patientPhone,
    /** Full PII — only returned for owner-scoped single-appointment detail. */
    patientEmail: appt.patientEmail,
    /** Full PII — only returned for owner-scoped single-appointment detail. */
    patientCedula: appt.patientCedula,
    scheduledAt: appt.scheduledAt,
    durationMinutes: appt.durationMinutes,
    status: appt.status,
    appointmentMode: appt.appointmentMode,
    source: appt.source,
    planName: appt.planName,
    planPrice: appt.planPrice,
    paymentMethod: appt.paymentMethod,
    paymentReference: appt.paymentReference,
    paymentReceiptUrl: appt.paymentReceiptUrl,
    insuranceName: appt.insuranceName,
    bcvRate: appt.bcvRate,
    amountBs: appt.amountBs,
    packageId: appt.packageId,
    sessionNumber: appt.sessionNumber,
    /** Chief complaint / reason for visit. */
    chiefComplaint: appt.chiefComplaint,
    appointmentCode: appt.appointmentCode,
    paymentId: appt.paymentId,
    meetLink: appt.meetLink,
    officeId: appt.officeId,
    /** Office name — populated only by the enriched detail query (JOIN with doctor_offices). */
    officeName: appt.officeName,
    googleCalendarEventId: appt.googleCalendarEventId,
    createdAt: appt.createdAt,
    updatedAt: appt.updatedAt,
    /** Payment status from the linked consultation. Null when no consultation is linked. */
    paymentStatus: appt.paymentStatus,
    /** Consultation code (DLT-YYYYMM-NNNN). Null when no consultation is linked. */
    consultationCode: appt.consultationCode,
  };
}

/** Returns a copy of the appointment with PII fields masked for list responses. */
export function maskAppointmentPii(appt: Appointment): Appointment {
  return Object.assign(Object.create(Object.getPrototypeOf(appt) as object), appt, {
    patientName: appt.patientName ? maskName(appt.patientName) : null,
    patientPhone: appt.patientPhone ? maskPhone(appt.patientPhone) : null,
    patientEmail: appt.patientEmail ? maskEmail(appt.patientEmail) : null,
    patientCedula: appt.patientCedula ? maskCedula(appt.patientCedula) : null,
  });
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return name;
  const first = parts[0] ?? name;
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const lastInitial = lastPart ? ` ${lastPart[0]}.` : '';
  return `${first}${lastInitial}`;
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

function maskCedula(cedula: string): string {
  if (cedula.length <= 5) return cedula;
  return `${cedula.slice(0, 3)}***${cedula.slice(-2)}`;
}
