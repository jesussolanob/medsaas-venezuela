import {
  isWithinSupportHours,
  parseSupportHoursConfig,
  DEFAULT_SUPPORT_HOURS,
} from './support-hours.vo';

/**
 * America/Caracas is UTC-4, no DST.
 *
 * Test matrix (UTC → Caracas):
 *   Saturday  17:59 UTC-4 = 13:59 local Sat → IN (Sat is in days, 13:59 < 18:00)
 *   Wait — the test says "Saturday 17:59 → in" meaning Caracas time 17:59,
 *   which is UTC 21:59.
 *
 * From spec:
 *   - Saturday 17:59 → in
 *   - Saturday 18:00 → out
 *   - Monday 07:59 → out
 *   - Monday 08:00 → in
 *   - Sunday any time → out
 *   - A UTC instant that is Monday in UTC but Sunday in Caracas → out
 */
describe('isWithinSupportHours', () => {
  const config = DEFAULT_SUPPORT_HOURS; // days 1-6, 08:00-18:00, America/Caracas (UTC-4)

  /**
   * Helpers to build UTC dates that correspond to a specific Caracas local time.
   * Caracas = UTC - 4h.
   */
  function utcForCaracas(year: number, month: number, day: number, hour: number, minute = 0): Date {
    // UTC time = Caracas time + 4h
    return new Date(Date.UTC(year, month - 1, day, hour + 4, minute));
  }

  describe('Saturday boundary', () => {
    it('Saturday 17:59 Caracas → in', () => {
      // Saturday 2026-11-07 17:59 Caracas = UTC 21:59
      // Nov 7 2026 is a Saturday
      const d = utcForCaracas(2026, 11, 7, 17, 59);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });

    it('Saturday 18:00 Caracas → out (end is exclusive)', () => {
      const d = utcForCaracas(2026, 11, 7, 18, 0);
      expect(isWithinSupportHours(d, config)).toBe(false);
    });

    it('Saturday 08:00 Caracas → in', () => {
      const d = utcForCaracas(2026, 11, 7, 8, 0);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });
  });

  describe('Monday boundary', () => {
    it('Monday 07:59 Caracas → out', () => {
      // Nov 2 2026 is a Monday
      const d = utcForCaracas(2026, 11, 2, 7, 59);
      expect(isWithinSupportHours(d, config)).toBe(false);
    });

    it('Monday 08:00 Caracas → in', () => {
      const d = utcForCaracas(2026, 11, 2, 8, 0);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });

    it('Monday 12:30 Caracas → in', () => {
      const d = utcForCaracas(2026, 11, 2, 12, 30);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });

    it('Monday 17:59 Caracas → in', () => {
      const d = utcForCaracas(2026, 11, 2, 17, 59);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });

    it('Monday 18:00 Caracas → out', () => {
      const d = utcForCaracas(2026, 11, 2, 18, 0);
      expect(isWithinSupportHours(d, config)).toBe(false);
    });
  });

  describe('Sunday always out', () => {
    it('Sunday 12:00 Caracas → out', () => {
      // Nov 8 2026 is a Sunday
      const d = utcForCaracas(2026, 11, 8, 12, 0);
      expect(isWithinSupportHours(d, config)).toBe(false);
    });

    it('Sunday 09:00 Caracas → out', () => {
      const d = utcForCaracas(2026, 11, 8, 9, 0);
      expect(isWithinSupportHours(d, config)).toBe(false);
    });
  });

  describe('UTC day vs Caracas day edge case', () => {
    /**
     * A UTC instant that is Monday in UTC but Sunday in Caracas → out
     *
     * Monday 2026-11-02 UTC 00:30 = Sunday 2026-11-01 Caracas 20:30
     * (UTC - 4h = 00:30 - 4h = Sunday 20:30)
     */
    it('Monday UTC 00:30 = Sunday Caracas → out', () => {
      const d = new Date(Date.UTC(2026, 10, 2, 0, 30)); // Nov 2 UTC 00:30
      // In Caracas: Nov 1 20:30 → Sunday
      expect(isWithinSupportHours(d, config)).toBe(false);
    });

    /**
     * Also test: Saturday UTC 23:00 = Sunday Caracas 19:00
     * Saturday UTC 23:00 + (-4h) = Sunday 19:00 Caracas → out (Sunday)
     */
    it('Saturday UTC 23:00 = Sunday Caracas 19:00 → out', () => {
      const d = new Date(Date.UTC(2026, 10, 7, 23, 0)); // Nov 7 (Sat) UTC 23:00
      // In Caracas: Nov 8 (Sun) 19:00 → out (Sunday)
      expect(isWithinSupportHours(d, config)).toBe(false);
    });
  });

  describe('weekdays (Tue-Fri)', () => {
    it('Tuesday 10:00 Caracas → in', () => {
      // Nov 3 2026 is a Tuesday
      const d = utcForCaracas(2026, 11, 3, 10, 0);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });

    it('Friday 17:30 Caracas → in', () => {
      // Nov 6 2026 is a Friday
      const d = utcForCaracas(2026, 11, 6, 17, 30);
      expect(isWithinSupportHours(d, config)).toBe(true);
    });
  });
});

describe('parseSupportHoursConfig', () => {
  const validRaw = JSON.stringify({
    days: [1, 2, 3, 4, 5, 6],
    start: '08:00',
    end: '18:00',
    timezone: 'America/Caracas',
  });

  it('returns parsed config for valid input', () => {
    const result = parseSupportHoursConfig(validRaw);
    expect(result).not.toBeNull();
    expect(result!.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.start).toBe('08:00');
    expect(result!.end).toBe('18:00');
    expect(result!.timezone).toBe('America/Caracas');
  });

  it('accepts empty days array (all times outside)', () => {
    const raw = JSON.stringify({
      days: [],
      start: '08:00',
      end: '18:00',
      timezone: 'America/Caracas',
    });
    expect(parseSupportHoursConfig(raw)).not.toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseSupportHoursConfig('not-json')).toBeNull();
  });

  it('returns null when fields are missing', () => {
    expect(
      parseSupportHoursConfig(JSON.stringify({ days: [1], start: '08:00', end: '18:00' })),
    ).toBeNull();
  });

  it('returns null when days contains a value outside 1..7', () => {
    const raw = JSON.stringify({
      days: [0, 1, 2],
      start: '08:00',
      end: '18:00',
      timezone: 'America/Caracas',
    });
    expect(parseSupportHoursConfig(raw)).toBeNull();
  });

  it('returns null when days contains 8', () => {
    const raw = JSON.stringify({
      days: [1, 8],
      start: '08:00',
      end: '18:00',
      timezone: 'America/Caracas',
    });
    expect(parseSupportHoursConfig(raw)).toBeNull();
  });

  it('returns null when start has invalid HH:MM format', () => {
    const raw = JSON.stringify({
      days: [1],
      start: '8:00',
      end: '18:00',
      timezone: 'America/Caracas',
    });
    expect(parseSupportHoursConfig(raw)).toBeNull();
  });

  it('returns null when start >= end', () => {
    const raw = JSON.stringify({
      days: [1],
      start: '18:00',
      end: '08:00',
      timezone: 'America/Caracas',
    });
    expect(parseSupportHoursConfig(raw)).toBeNull();
  });

  it('returns null when start equals end', () => {
    const raw = JSON.stringify({
      days: [1],
      start: '08:00',
      end: '08:00',
      timezone: 'America/Caracas',
    });
    expect(parseSupportHoursConfig(raw)).toBeNull();
  });

  it('returns null for an invalid IANA timezone (does not throw)', () => {
    const raw = JSON.stringify({
      days: [1],
      start: '08:00',
      end: '18:00',
      timezone: 'Invalid/Zone',
    });
    // Must not throw RangeError — returns null instead
    expect(() => parseSupportHoursConfig(raw)).not.toThrow();
    expect(parseSupportHoursConfig(raw)).toBeNull();
  });
});
