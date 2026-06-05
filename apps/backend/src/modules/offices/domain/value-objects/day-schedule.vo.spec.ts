import { DaySchedule, formatMinutes } from './day-schedule.vo';

describe('DaySchedule value object', () => {
  describe('DaySchedule.create', () => {
    it('creates a valid enabled day schedule', () => {
      const ds = DaySchedule.create({ day: 0, enabled: true, start: '08:00', end: '17:00' });
      expect(ds.day).toBe(0);
      expect(ds.enabled).toBe(true);
      expect(ds.start).toBe('08:00');
      expect(ds.end).toBe('17:00');
    });

    it('creates a disabled day schedule', () => {
      const ds = DaySchedule.create({ day: 6, enabled: false, start: '00:00', end: '00:00' });
      expect(ds.enabled).toBe(false);
    });
  });

  describe('hasValidWindow', () => {
    it('returns true when start < end', () => {
      const ds = DaySchedule.create({ day: 0, enabled: true, start: '08:00', end: '17:00' });
      expect(ds.hasValidWindow()).toBe(true);
    });

    it('returns false when start >= end (misconfigured)', () => {
      const ds = DaySchedule.create({ day: 0, enabled: true, start: '17:00', end: '08:00' });
      expect(ds.hasValidWindow()).toBe(false);
    });

    it('returns false when start === end', () => {
      const ds = DaySchedule.create({ day: 0, enabled: true, start: '09:00', end: '09:00' });
      expect(ds.hasValidWindow()).toBe(false);
    });

    it('returns true for disabled day (window not required)', () => {
      const ds = DaySchedule.create({ day: 0, enabled: false, start: '17:00', end: '08:00' });
      expect(ds.hasValidWindow()).toBe(true);
    });
  });

  describe('startMinutes / endMinutes', () => {
    it('parses 08:00 as 480 minutes', () => {
      const ds = DaySchedule.create({ day: 0, enabled: true, start: '08:00', end: '17:00' });
      expect(ds.startMinutes()).toBe(480);
    });

    it('parses 17:00 as 1020 minutes', () => {
      const ds = DaySchedule.create({ day: 0, enabled: true, start: '08:00', end: '17:00' });
      expect(ds.endMinutes()).toBe(1020);
    });
  });

  describe('DaySchedule.validate', () => {
    it('returns a DaySchedule for valid input', () => {
      const result = DaySchedule.validate({ day: 2, enabled: true, start: '09:00', end: '18:00' });
      expect(result).not.toBeNull();
      expect(result?.day).toBe(2);
    });

    it('returns null for non-object input', () => {
      expect(DaySchedule.validate(null)).toBeNull();
      expect(DaySchedule.validate('invalid')).toBeNull();
      expect(DaySchedule.validate(42)).toBeNull();
    });

    it('returns null when day is out of range 0-6', () => {
      expect(
        DaySchedule.validate({ day: 7, enabled: true, start: '08:00', end: '17:00' }),
      ).toBeNull();
      expect(
        DaySchedule.validate({ day: -1, enabled: true, start: '08:00', end: '17:00' }),
      ).toBeNull();
    });

    it('returns null when day is not an integer', () => {
      expect(
        DaySchedule.validate({ day: 1.5, enabled: true, start: '08:00', end: '17:00' }),
      ).toBeNull();
    });

    it('returns null when day is not a number', () => {
      expect(
        DaySchedule.validate({ day: 'monday', enabled: true, start: '08:00', end: '17:00' }),
      ).toBeNull();
    });

    it('returns null when enabled is not boolean', () => {
      expect(
        DaySchedule.validate({ day: 0, enabled: 'yes', start: '08:00', end: '17:00' }),
      ).toBeNull();
    });

    it('returns null when start does not match HH:MM pattern', () => {
      expect(
        DaySchedule.validate({ day: 0, enabled: true, start: '8:00', end: '17:00' }),
      ).toBeNull();
      expect(
        DaySchedule.validate({ day: 0, enabled: true, start: 'bad', end: '17:00' }),
      ).toBeNull();
    });

    it('returns null when end does not match HH:MM pattern', () => {
      expect(
        DaySchedule.validate({ day: 0, enabled: true, start: '08:00', end: '5:00' }),
      ).toBeNull();
    });

    it('accepts boundary day values 0 and 6', () => {
      expect(
        DaySchedule.validate({ day: 0, enabled: true, start: '08:00', end: '12:00' }),
      ).not.toBeNull();
      expect(
        DaySchedule.validate({ day: 6, enabled: true, start: '08:00', end: '12:00' }),
      ).not.toBeNull();
    });
  });

  describe('formatMinutes helper', () => {
    it('formats 0 as 00:00', () => {
      expect(formatMinutes(0)).toBe('00:00');
    });

    it('formats 480 as 08:00', () => {
      expect(formatMinutes(480)).toBe('08:00');
    });

    it('formats 1020 as 17:00', () => {
      expect(formatMinutes(1020)).toBe('17:00');
    });

    it('formats 90 as 01:30', () => {
      expect(formatMinutes(90)).toBe('01:30');
    });
  });
});
