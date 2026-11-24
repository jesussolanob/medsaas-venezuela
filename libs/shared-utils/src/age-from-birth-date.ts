const CARACAS_TZ = 'America/Caracas';
const MAX_PLAUSIBLE_AGE = 130;

type CalendarDate = { year: number; month: number; day: number };

function parseIsoDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Today's calendar date (YYYY-MM-DD) in Caracas, the clinics' reference timezone. */
function todayInCaracas(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Age in whole years derived from a birth date. The age is never stored: it is
 * always computed so it can't go stale.
 *
 * Accepts the DATEONLY string Postgres returns (`YYYY-MM-DD`, optionally with a
 * time part) or a Date. Returns null for missing, malformed, future or
 * implausible (>130 years) dates.
 */
export function ageFromBirthDate(
  birthDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const iso = birthDate instanceof Date ? birthDate.toISOString() : String(birthDate);
  const birth = parseIsoDate(iso);
  const today = parseIsoDate(todayInCaracas(now));
  if (!birth || !today) return null;
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age--;
  return age >= 0 && age <= MAX_PLAUSIBLE_AGE ? age : null;
}
