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
