import type { Appointment } from '../../domain/entities/appointment.entity';

/**
 * Presentation-layer mapper for appointment data.
 *
 * Masking is applied here — never in the repository or in use cases.
 * Rule: `00-estructura-modulo.md` — "El masking lo aplica el mapper en la
 * capa de presentación, nunca el repositorio."
 */

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
