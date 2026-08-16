import { Office, type OfficeCreateParams } from './office.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const OFFICE_ID = 'oooooooo-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeOffice(overrides: Partial<OfficeCreateParams> = {}): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId: DOCTOR_ID,
    name: 'Consultorio Principal',
    address: 'Av. Principal 123',
    city: 'Caracas',
    phone: '+58 212 555 0000',
    schedule: [
      { day: 0, enabled: true, start: '08:00', end: '17:00' }, // Monday
      { day: 1, enabled: true, start: '08:00', end: '17:00' }, // Tuesday
      { day: 5, enabled: false, start: '08:00', end: '12:00' }, // Saturday disabled
    ],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality: 'in_person',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Office entity', () => {
  describe('construction', () => {
    it('creates an office with all properties', () => {
      const office = makeOffice();

      expect(office.id).toBe(OFFICE_ID);
      expect(office.doctorId).toBe(DOCTOR_ID);
      expect(office.name).toBe('Consultorio Principal');
      expect(office.address).toBe('Av. Principal 123');
      expect(office.city).toBe('Caracas');
      expect(office.slotDuration).toBe(30);
      expect(office.bufferMinutes).toBe(10);
      expect(office.isActive).toBe(true);
    });
  });

  describe('isOwnedBy', () => {
    it('returns true for the owning doctor', () => {
      const office = makeOffice();
      expect(office.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const office = makeOffice();
      expect(office.isOwnedBy(OTHER_DOCTOR_ID)).toBe(false);
    });

    it('returns false for an empty string', () => {
      const office = makeOffice();
      expect(office.isOwnedBy('')).toBe(false);
    });
  });

  describe('getEnabledSchedulesForDay', () => {
    it('returns all enabled entries for a day with a single block', () => {
      const office = makeOffice();
      const entries = office.getEnabledSchedulesForDay(0); // Monday

      expect(entries).toHaveLength(1);
      expect(entries[0]?.day).toBe(0);
      expect(entries[0]?.start).toBe('08:00');
    });

    it('returns all enabled entries for a day with multiple blocks', () => {
      const office = makeOffice({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '12:00' },
          { day: 0, enabled: true, start: '15:00', end: '18:00' },
        ],
      });
      const entries = office.getEnabledSchedulesForDay(0);

      expect(entries).toHaveLength(2);
      expect(entries[0]?.start).toBe('08:00');
      expect(entries[1]?.start).toBe('15:00');
    });

    it('returns empty array for a day not in schedule', () => {
      const office = makeOffice();
      const entries = office.getEnabledSchedulesForDay(3); // Thursday not in schedule

      expect(entries).toHaveLength(0);
    });

    it('returns empty array for a disabled day', () => {
      const office = makeOffice();
      const entries = office.getEnabledSchedulesForDay(5); // Saturday disabled

      expect(entries).toHaveLength(0);
    });

    it('returns empty array for an empty schedule', () => {
      const office = makeOffice({ schedule: [] });
      expect(office.getEnabledSchedulesForDay(0)).toHaveLength(0);
    });

    it('only returns enabled blocks when day has mixed enabled/disabled entries', () => {
      const office = makeOffice({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '12:00' },
          { day: 0, enabled: false, start: '15:00', end: '18:00' },
        ],
      });
      const entries = office.getEnabledSchedulesForDay(0);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.start).toBe('08:00');
    });
  });

  describe('getEnabledScheduleForDay (deprecated wrapper)', () => {
    it('returns the first enabled entry for an enabled day', () => {
      const office = makeOffice();
      const entry = office.getEnabledScheduleForDay(0); // Monday

      expect(entry).not.toBeNull();
      expect(entry?.day).toBe(0);
      expect(entry?.start).toBe('08:00');
    });

    it('returns null for a day not in schedule', () => {
      const office = makeOffice();
      const entry = office.getEnabledScheduleForDay(3); // Thursday not in schedule

      expect(entry).toBeNull();
    });

    it('returns null for a disabled day', () => {
      const office = makeOffice();
      const entry = office.getEnabledScheduleForDay(5); // Saturday disabled

      expect(entry).toBeNull();
    });

    it('returns null for an empty schedule', () => {
      const office = makeOffice({ schedule: [] });
      expect(office.getEnabledScheduleForDay(0)).toBeNull();
    });
  });

  describe('toggleActive', () => {
    it('returns a new office with isActive flipped to false', () => {
      const office = makeOffice({ isActive: true });
      const toggled = office.toggleActive();

      expect(toggled.isActive).toBe(false);
      expect(toggled.id).toBe(office.id);
      expect(toggled.name).toBe(office.name);
    });

    it('returns a new office with isActive flipped to true', () => {
      const office = makeOffice({ isActive: false });
      const toggled = office.toggleActive();

      expect(toggled.isActive).toBe(true);
    });

    it('does not mutate the original office', () => {
      const office = makeOffice({ isActive: true });
      office.toggleActive();

      expect(office.isActive).toBe(true);
    });

    it('returns a new object reference (immutability)', () => {
      const office = makeOffice();
      const toggled = office.toggleActive();

      expect(toggled).not.toBe(office);
    });

    it('updates updatedAt on toggle', () => {
      const office = makeOffice({ updatedAt: now });
      const toggled = office.toggleActive();

      // updatedAt should be more recent than or equal to now
      expect(toggled.updatedAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });
  });

  describe('Office.create factory', () => {
    it('creates an office with an empty schedule', () => {
      const office = Office.create({
        id: OFFICE_ID,
        doctorId: DOCTOR_ID,
        name: 'New Office',
        address: '',
        city: '',
        phone: '',
        schedule: [],
        slotDuration: 30,
        bufferMinutes: 0,
        isActive: true,
        modality: 'in_person',
        createdAt: now,
        updatedAt: now,
      });

      expect(office.schedule).toHaveLength(0);
    });
  });

  describe('mapUrl', () => {
    it('defaults to null when not provided', () => {
      const office = makeOffice();
      expect(office.mapUrl).toBeNull();
    });

    it('stores a valid https map URL', () => {
      const office = makeOffice({ mapUrl: 'https://maps.google.com/?q=Caracas' });
      expect(office.mapUrl).toBe('https://maps.google.com/?q=Caracas');
    });

    it('stores null when explicitly set to null', () => {
      const office = makeOffice({ mapUrl: null });
      expect(office.mapUrl).toBeNull();
    });

    it('preserves mapUrl through toggleActive (immutable round-trip)', () => {
      const url = 'https://maps.google.com/?q=Test';
      const office = makeOffice({ mapUrl: url });
      const toggled = office.toggleActive();
      expect(toggled.mapUrl).toBe(url);
    });
  });

  /**
   * slotDurationAt tests use real UTC timestamps that map to known Caracas
   * wall-clock times (Venezuela is UTC-04:00 fixed, no DST):
   *
   *   2026-01-05 = Monday   (Jan 1 = Thu, Jan 5 = Mon)
   *   2026-01-06 = Tuesday
   *   2026-01-07 = Wednesday
   *
   *   09:30 Caracas = 13:30 UTC  (2026-01-05T13:30:00Z = Monday morning)
   *   15:00 Caracas = 19:00 UTC  (2026-01-05T19:00:00Z = Monday afternoon)
   *   14:00 Caracas = 18:00 UTC  (2026-01-06T18:00:00Z = Tuesday afternoon)
   *   10:00 Caracas = 14:00 UTC  (2026-01-07T14:00:00Z = Wednesday, no block)
   */
  describe('slotDurationAt', () => {
    /** Office with two Monday blocks and one Tuesday block (ADR-028 setup). */
    function makeBlockOffice(): Office {
      return makeOffice({
        slotDuration: 30, // office-wide default
        schedule: [
          // Monday morning: 45-min override (ADR-028 example)
          { day: 0, enabled: true, start: '08:00', end: '12:00', slotDuration: 45 },
          // Monday afternoon: no per-block override → inherits office default
          { day: 0, enabled: true, start: '14:00', end: '18:00' },
          // Tuesday afternoon: 20-min override (ADR-028 example)
          { day: 1, enabled: true, start: '13:00', end: '18:00', slotDuration: 20 },
        ],
      });
    }

    it('returns block slotDuration when the block has its own override', () => {
      const office = makeBlockOffice();
      // Monday 09:30 Caracas (inside 08:00-12:00 block with slotDuration=45)
      expect(office.slotDurationAt(new Date('2026-01-05T13:30:00Z'))).toBe(45);
    });

    it('returns office.slotDuration when the block has no override', () => {
      const office = makeBlockOffice();
      // Monday 15:00 Caracas (inside 14:00-18:00 block with no slotDuration)
      expect(office.slotDurationAt(new Date('2026-01-05T19:00:00Z'))).toBe(30);
    });

    it('returns office.slotDuration when scheduledAt falls outside every block', () => {
      const office = makeBlockOffice();
      // Wednesday 10:00 Caracas — no block defined for Wednesday (office day 2)
      expect(office.slotDurationAt(new Date('2026-01-07T14:00:00Z'))).toBe(30);
    });

    it('returns office.slotDuration when the office has no schedule at all', () => {
      const office = makeOffice({ slotDuration: 25, schedule: [] });
      expect(office.slotDurationAt(new Date('2026-01-05T13:30:00Z'))).toBe(25);
    });

    it('ADR-028 end-to-end: Monday 45-min and Tuesday 20-min resolve independently', () => {
      const office = makeBlockOffice();
      // Monday morning 09:30 Caracas → 45-min block
      const mondayAppt = new Date('2026-01-05T13:30:00Z');
      // Tuesday afternoon 14:00 Caracas → 20-min block
      const tuesdayAppt = new Date('2026-01-06T18:00:00Z');

      expect(office.slotDurationAt(mondayAppt)).toBe(45);
      expect(office.slotDurationAt(tuesdayAppt)).toBe(20);
    });

    it('respects the [start, end) boundary — exact start is inside, exact end is outside', () => {
      const office = makeOffice({
        slotDuration: 30,
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '12:00', slotDuration: 45 }],
      });
      // Monday 08:00 Caracas (exact start = inside) → 12:00 UTC
      expect(office.slotDurationAt(new Date('2026-01-05T12:00:00Z'))).toBe(45);
      // Monday 12:00 Caracas (exact end = outside) → 16:00 UTC
      expect(office.slotDurationAt(new Date('2026-01-05T16:00:00Z'))).toBe(30);
    });
  });

  describe('supportsModality', () => {
    it('in_person office only supports in_person', () => {
      const office = makeOffice({ modality: 'in_person' });
      expect(office.supportsModality('in_person')).toBe(true);
      expect(office.supportsModality('online')).toBe(false);
    });

    it('in_person office supports presencial alias (AppointmentModeSchema vocab)', () => {
      const office = makeOffice({ modality: 'in_person' });
      expect(office.supportsModality('presencial')).toBe(true);
    });

    it('presencial booking in in_person office does NOT throw mismatch', () => {
      const office = makeOffice({ modality: 'in_person' });
      // Verify no mismatch: presencial maps to in_person
      expect(office.supportsModality('presencial')).toBe(true);
    });

    it('online office only supports online', () => {
      const office = makeOffice({ modality: 'online' });
      expect(office.supportsModality('online')).toBe(true);
      expect(office.supportsModality('in_person')).toBe(false);
    });

    it('online office does not accept presencial alias', () => {
      const office = makeOffice({ modality: 'online' });
      expect(office.supportsModality('presencial')).toBe(false);
    });

    it('both office supports any modality', () => {
      const office = makeOffice({ modality: 'both' });
      expect(office.supportsModality('in_person')).toBe(true);
      expect(office.supportsModality('online')).toBe(true);
    });

    it('both office supports presencial alias', () => {
      const office = makeOffice({ modality: 'both' });
      expect(office.supportsModality('presencial')).toBe(true);
    });
  });
});
