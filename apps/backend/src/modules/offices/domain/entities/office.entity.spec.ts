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

  describe('getEnabledScheduleForDay', () => {
    it('returns the schedule entry for an enabled day', () => {
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
        createdAt: now,
        updatedAt: now,
      });

      expect(office.schedule).toHaveLength(0);
    });
  });
});
