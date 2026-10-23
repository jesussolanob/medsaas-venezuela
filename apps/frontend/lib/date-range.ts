/**
 * Date-range utilities for admin filtering.
 *
 * All calendar-day boundaries are interpreted in America/Caracas (UTC-4, no DST).
 * - `from` is the start of that calendar day in Caracas (00:00:00.000 -04:00).
 * - `to` is the end of that calendar day in Caracas (23:59:59.999 -04:00).
 *
 * The backend stores timestamps in UTC; this module converts YYYY-MM-DD strings
 * (Caracas calendar days) to UTC millisecond boundaries for comparison.
 */

/** Fixed UTC offset for America/Caracas (UTC-4, no DST since 2016). */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * Returns the current wall-clock date components in Caracas time.
 */
export function getCaracasDateParts(): { year: number; month: number; day: number } {
  const nowCaracasMs = Date.now() - CARACAS_OFFSET_MS;
  const d = new Date(nowCaracasMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
  };
}

/**
 * Formats { year, month (0-based), day } as YYYY-MM-DD.
 */
export function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Returns today as a YYYY-MM-DD string in Caracas time.
 */
export function todayCaracas(): string {
  const { year, month, day } = getCaracasDateParts();
  return toYMD(year, month, day);
}

/**
 * Returns the first day of the current month in Caracas time as YYYY-MM-DD.
 */
export function startOfCurrentMonthCaracas(): string {
  const { year, month } = getCaracasDateParts();
  return toYMD(year, month, 1);
}

/**
 * Returns the first day of the previous month in Caracas as YYYY-MM-DD.
 */
export function startOfPreviousMonthCaracas(): string {
  const { year, month } = getCaracasDateParts();
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return toYMD(prevYear, prevMonth, 1);
}

/**
 * Returns the last day of the previous month in Caracas as YYYY-MM-DD.
 */
export function endOfPreviousMonthCaracas(): string {
  const { year, month } = getCaracasDateParts();
  // Last day of previous month = day 0 of current month
  const last = new Date(Date.UTC(year, month, 0));
  return toYMD(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
}

/**
 * Returns a YYYY-MM-DD string that is `n` days before today in Caracas time.
 */
export function daysAgoCaracas(n: number): string {
  const { year, month, day } = getCaracasDateParts();
  const d = new Date(Date.UTC(year, month, day - n));
  return toYMD(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Returns the UTC millisecond at the START of a Caracas calendar day.
 * from = 00:00:00.000 Caracas = the given UTC date + CARACAS_OFFSET_MS
 */
function caracasDayStartMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  // midnight UTC of that day, then shift to Caracas midnight
  return Date.UTC(y, m - 1, d) + CARACAS_OFFSET_MS;
}

/**
 * Returns the UTC millisecond at the END of a Caracas calendar day (23:59:59.999).
 * to = 23:59:59.999 Caracas = next-day start - 1 ms
 */
function caracasDayEndMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d + 1) + CARACAS_OFFSET_MS - 1;
}

/**
 * Returns whether `isoDate` falls within the given Caracas calendar-day range.
 *
 * - Null/undefined `isoDate` → false when any bound is set, true when no bounds.
 * - Null/undefined `from` → no lower bound.
 * - Null/undefined `to` → no upper bound.
 * - When both `from` and `to` are null → always true (inactive range, passes all).
 */
export function isWithinRange(
  isoDate: string | null | undefined,
  from: string | null,
  to: string | null,
): boolean {
  const hasRange = Boolean(from || to);
  if (!hasRange) return true;
  if (!isoDate) return false;

  const dateMs = new Date(isoDate).getTime();
  if (isNaN(dateMs)) return false;

  if (from && dateMs < caracasDayStartMs(from)) return false;
  if (to && dateMs > caracasDayEndMs(to)) return false;

  return true;
}

/**
 * Returns the UTC millisecond for the start of the current Caracas month.
 * Used by components that compute "new this month" KPIs.
 */
export function startOfCurrentMonthCaracasMs(): number {
  const { year, month } = getCaracasDateParts();
  return Date.UTC(year, month, 1) + CARACAS_OFFSET_MS;
}
