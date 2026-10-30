/**
 * SupportHours value object.
 *
 * Evaluates whether a given UTC instant falls within the support team's
 * working hours in America/Caracas (UTC-4, no DST).
 *
 * Uses Intl.DateTimeFormat to correctly convert UTC to Caracas local time,
 * never the server's local timezone.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export interface SupportHoursConfig {
  /** ISO weekday numbers, 1=Monday … 7=Sunday */
  days: number[];
  /** "HH:MM" in 24-hour format, Caracas local time */
  start: string;
  /** "HH:MM" in 24-hour format, Caracas local time */
  end: string;
  timezone: string;
}

export const DEFAULT_SUPPORT_HOURS: SupportHoursConfig = {
  days: [1, 2, 3, 4, 5, 6],
  start: '08:00',
  end: '18:00',
  timezone: 'America/Caracas',
};

function parseHHMM(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/**
 * Returns the ISO weekday (1=Monday … 7=Sunday) for a UTC instant
 * in the given IANA timezone.
 */
function getWeekdayInTz(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const weekday = formatter.format(utcDate);
  // Map English short names → ISO weekday number
  const MAP: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return MAP[weekday] ?? 7;
}

/**
 * Returns the local hour and minute for a UTC instant in the given IANA timezone.
 */
function getHourMinuteInTz(utcDate: Date, timezone: string): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  // Intl returns 24 for midnight in some locales
  if (hour === 24) hour = 0;
  return { hour, minute };
}

const HH_MM_RE = /^\d{2}:\d{2}$/;

function toMinutes(hhmm: string): number {
  const { hour, minute } = parseHHMM(hhmm);
  return hour * 60 + minute;
}

/**
 * Parses and validates an admin-supplied support hours JSON string.
 *
 * Validates:
 *   - Valid JSON object with `days`, `start`, `end`, `timezone` fields.
 *   - `days`: array of integers, each in [1..7].
 *   - `start` / `end`: "HH:MM" format, start < end.
 *   - `timezone`: valid IANA zone (verified via Intl.DateTimeFormat).
 *
 * Returns the parsed config on success, or null on any validation failure.
 * The caller is responsible for falling back to defaults and logging.
 *
 * NOTE: The Intl.DateTimeFormat constructor call is intentionally inside
 * the try/catch so that an invalid timezone RangeError is caught here
 * rather than propagating to the caller.
 */
export function parseSupportHoursConfig(raw: string): SupportHoursConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { days?: unknown }).days) ||
      typeof (parsed as { start?: unknown }).start !== 'string' ||
      typeof (parsed as { end?: unknown }).end !== 'string' ||
      typeof (parsed as { timezone?: unknown }).timezone !== 'string'
    ) {
      return null;
    }

    const { days, start, end, timezone } = parsed as {
      days: unknown[];
      start: string;
      end: string;
      timezone: string;
    };

    // Validate days: array of integers in [1..7]
    if (!days.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7)) {
      return null;
    }

    // Validate HH:MM format
    if (!HH_MM_RE.test(start) || !HH_MM_RE.test(end)) {
      return null;
    }

    // Validate start < end
    if (toMinutes(start) >= toMinutes(end)) {
      return null;
    }

    // Validate timezone — RangeError for invalid zone is caught below
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });

    return { days: days as number[], start, end, timezone };
  } catch {
    return null;
  }
}

/**
 * Returns true when the given UTC instant falls within the support hours.
 */
export function isWithinSupportHours(
  utcNow: Date,
  config: SupportHoursConfig = DEFAULT_SUPPORT_HOURS,
): boolean {
  const timezone = config.timezone;

  const weekday = getWeekdayInTz(utcNow, timezone);
  if (!config.days.includes(weekday)) {
    return false;
  }

  const { hour, minute } = getHourMinuteInTz(utcNow, timezone);
  const localMinutes = hour * 60 + minute;

  const startParsed = parseHHMM(config.start);
  const endParsed = parseHHMM(config.end);
  const startMinutes = startParsed.hour * 60 + startParsed.minute;
  const endMinutes = endParsed.hour * 60 + endParsed.minute;

  // start is inclusive, end is exclusive (18:00 is outside hours)
  return localMinutes >= startMinutes && localMinutes < endMinutes;
}
