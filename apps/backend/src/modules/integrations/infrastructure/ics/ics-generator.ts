/**
 * ICS Calendar File Generator
 *
 * Generates RFC 5545-compliant .ics VEVENT strings for appointment invitations.
 *
 * - Online appointments with a Meet link: meetLink goes into LOCATION + DESCRIPTION.
 * - Online appointments without Google (Jitsi fallback): Jitsi link goes in LOCATION + DESCRIPTION.
 * - In-person appointments: physical address goes into LOCATION.
 *
 * No NestJS or Sequelize imports — pure utility module.
 */

/** Minutes before the appointment start at which the VALARM reminder fires. */
const REMINDER_MINUTES_BEFORE = 30;

export interface IcsEventParams {
  /** Unique appointment ID — used as UID. */
  appointmentId: string;
  /** Event title visible in calendar app. */
  summary: string;
  /** ISO 8601 start datetime (e.g. '2026-07-01T10:00:00Z'). */
  startISO: string;
  /** ISO 8601 end datetime (e.g. '2026-07-01T10:30:00Z'). */
  endISO: string;
  /** Organizer display name (doctor name). */
  organizerName: string;
  /** Organizer email. May be undefined when Google is not connected. */
  organizerEmail?: string;
  /** Attendee (patient) email. */
  attendeeEmail: string;
  /** Physical address for in-person appointments. */
  officeAddress?: string;
  /** Google Meet or Jitsi URL for online appointments. */
  meetLink?: string;
  /** Optional additional description text. */
  description?: string;
}

/**
 * Escapes special characters in iCal text fields per RFC 5545 §3.3.11.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Formats a JS Date as an iCal UTC datetime string: YYYYMMDDTHHMMSSZ.
 */
function toIcsDateTimeUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Generates a complete .ics file contents string for a single appointment event.
 */
export function generateIcsEvent(params: IcsEventParams): string {
  const now = toIcsDateTimeUtc(new Date().toISOString());
  const start = toIcsDateTimeUtc(params.startISO);
  const end = toIcsDateTimeUtc(params.endISO);

  const location = params.meetLink
    ? params.meetLink
    : params.officeAddress
      ? escapeIcsText(params.officeAddress)
      : '';

  const descriptionParts: string[] = [];
  if (params.description) descriptionParts.push(params.description);
  if (params.meetLink) descriptionParts.push(`Enlace de videollamada: ${params.meetLink}`);
  const description = descriptionParts.join('\\n');

  // Escape email addresses to prevent iCal header injection via ORGANIZER/ATTENDEE.
  // Truncate at first CR or LF to ensure no injected lines follow the email value.
  const safeOrganizerEmail = params.organizerEmail
    ? (params.organizerEmail.split(/[\r\n]/)[0] ?? 'noreply@delta.medical')
    : 'noreply@delta.medical';
  const safeAttendeeEmail = params.attendeeEmail.split(/[\r\n]/)[0] ?? '';

  const organizerLine = `ORGANIZER;CN=${escapeIcsText(params.organizerName)}:mailto:${safeOrganizerEmail}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Delta Medical CRM//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:delta-${params.appointmentId}@delta.medical`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
    location ? `LOCATION:${location}` : null,
    description ? `DESCRIPTION:${description}` : null,
    organizerLine,
    `ATTENDEE;CN=${escapeIcsText(safeAttendeeEmail)};RSVP=TRUE:mailto:${safeAttendeeEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de cita',
    `TRIGGER:-PT${REMINDER_MINUTES_BEFORE}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  // RFC 5545 §3.1: lines are delimited with CRLF; the file ends with a CRLF.
  return lines + '\r\n';
}
