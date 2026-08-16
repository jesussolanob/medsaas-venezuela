/**
 * Venezuela timezone helpers.
 *
 * Venezuela uses America/Caracas (UTC-04:00 fixed, no DST since 2016).
 * All conversions from UTC instants to Caracas wall-clock day or HH:MM must
 * go through these helpers so the mapping logic lives in exactly one place.
 *
 * NEVER derive the Caracas day or time from raw Date.getDay() / Date.getHours():
 * those reflect the JS engine's local timezone (the server host), not Caracas.
 *
 * No imports from NestJS, Sequelize, or any external library — only native Intl.
 */

/** Fixed offset for America/Caracas (UTC-04:00, no DST). */
export const CARACAS_OFFSET = '-04:00';

/**
 * Formats a UTC Date as "HH:MM" in America/Caracas wall-clock time.
 *
 * Example: 2026-08-16T13:30:00Z → "09:30" (Caracas is UTC-04:00)
 */
export function toCaracasHHMM(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Returns the office weekday (0=Monday … 6=Sunday) for a UTC instant in
 * America/Caracas local time.
 *
 * Strategy (same as GetAvailableSlotsUseCase):
 *   1. Format the Caracas date string (YYYY-MM-DD) with Intl.
 *   2. Parse it as a Caracas-midnight instant (T00:00:00-04:00 = T04:00:00Z).
 *   3. Call getUTCDay() — because the instant is anchored to Caracas midnight,
 *      getUTCDay() always reflects the correct Caracas calendar day without
 *      rolling over at UTC midnight.
 *   4. Convert JS day (0=Sunday) → office day (0=Monday): (jsDay + 6) % 7.
 */
export function toCaracasOfficeDay(d: Date): number {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const midnight = new Date(`${dateStr}T00:00:00.000${CARACAS_OFFSET}`);
  const jsDay = midnight.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  return (jsDay + 6) % 7; // 0=Mon … 6=Sun
}
