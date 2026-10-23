/**
 * Formats a UTC date as a localised datetime string for the America/Caracas timezone.
 *
 * Uses 24-hour format (hour12: false) to avoid a double-period artefact that occurs
 * when the email template appends a "." after the value and the es-VE locale produces
 * "a. m." as an am/pm suffix, resulting in "00:33 a. m.." (two periods).
 *
 * Venezuela is UTC-4 (fixed offset — no DST). A UTC time such as 04:33 will appear
 * as 00:33 in Caracas. A UTC time of 03:59 falls on the PREVIOUS calendar day.
 *
 * Example output: "25 de octubre de 2026, 00:33"
 */
export function formatShareExpiryCaracas(date: Date): string {
  return date.toLocaleString('es-VE', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
