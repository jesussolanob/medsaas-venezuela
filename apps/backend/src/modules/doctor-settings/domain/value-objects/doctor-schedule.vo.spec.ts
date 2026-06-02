import { DoctorSchedule } from './doctor-schedule.vo';

/** Helper: create a Date for a specific day-of-week in the current week. */
function dateForDay(dayOfWeek: number): Date {
  const now = new Date();
  const current = now.getDay();
  const diff = dayOfWeek - current;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}

describe('DoctorSchedule value object', () => {
  describe('generateSlotsForDate', () => {
    it('generates correct slots for a workday (Mon–Fri, 08:00–09:00, 30 min)', () => {
      const schedule = DoctorSchedule.create({
        workDays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '09:00',
        slotDurationMinutes: 30,
        breakStart: null,
        breakEnd: null,
      });

      const monday = dateForDay(1);
      const slots = schedule.generateSlotsForDate(monday);

      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual({ start: '08:00', end: '08:30' });
      expect(slots[1]).toEqual({ start: '08:30', end: '09:00' });
    });

    it('returns empty array for a non-workday (Sunday = 0)', () => {
      const schedule = DoctorSchedule.create({
        workDays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
        breakStart: null,
        breakEnd: null,
      });

      const sunday = dateForDay(0);
      expect(schedule.generateSlotsForDate(sunday)).toEqual([]);
    });

    it('excludes break time slots', () => {
      const schedule = DoctorSchedule.create({
        workDays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '10:00',
        slotDurationMinutes: 60,
        breakStart: '09:00',
        breakEnd: '10:00',
      });

      const monday = dateForDay(1);
      const slots = schedule.generateSlotsForDate(monday);

      // Only 08:00–09:00 should appear; 09:00–10:00 overlaps break
      expect(slots).toHaveLength(1);
      expect(slots[0]).toEqual({ start: '08:00', end: '09:00' });
    });

    it('respects slot duration (45 min)', () => {
      const schedule = DoctorSchedule.create({
        workDays: [1],
        startTime: '08:00',
        endTime: '10:00',
        slotDurationMinutes: 45,
        breakStart: null,
        breakEnd: null,
      });

      const monday = dateForDay(1);
      const slots = schedule.generateSlotsForDate(monday);

      // 08:00–08:45 and 08:45–09:30 fit; 09:30–10:15 overflows 10:00
      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual({ start: '08:00', end: '08:45' });
      expect(slots[1]).toEqual({ start: '08:45', end: '09:30' });
    });

    it('returns empty array when startTime >= endTime', () => {
      const schedule = DoctorSchedule.create({
        workDays: [1],
        startTime: '17:00',
        endTime: '08:00',
        slotDurationMinutes: 30,
        breakStart: null,
        breakEnd: null,
      });

      const monday = dateForDay(1);
      expect(schedule.generateSlotsForDate(monday)).toEqual([]);
    });

    it('excludes partial overlap slots at break boundary', () => {
      const schedule = DoctorSchedule.create({
        workDays: [1],
        startTime: '08:00',
        endTime: '13:00',
        slotDurationMinutes: 30,
        breakStart: '12:00',
        breakEnd: '13:00',
      });

      const monday = dateForDay(1);
      const slots = schedule.generateSlotsForDate(monday);

      // All slots from 08:00 to 12:00 should be included (8 slots of 30 min)
      // 12:00–12:30 overlaps break → excluded; 12:30–13:00 overlaps break → excluded
      expect(slots).toHaveLength(8);
      expect(slots[slots.length - 1]).toEqual({ start: '11:30', end: '12:00' });
    });

    it('includes weekend slots when workDays includes Saturday (6)', () => {
      const schedule = DoctorSchedule.create({
        workDays: [6],
        startTime: '09:00',
        endTime: '12:00',
        slotDurationMinutes: 60,
        breakStart: null,
        breakEnd: null,
      });

      const saturday = dateForDay(6);
      const slots = schedule.generateSlotsForDate(saturday);

      expect(slots).toHaveLength(3);
      expect(slots[0]).toEqual({ start: '09:00', end: '10:00' });
    });
  });

  describe('DoctorSchedule.default()', () => {
    it('returns Mon–Fri, 08:00–17:00, 30 min default', () => {
      const schedule = DoctorSchedule.default();

      expect(schedule.workDays).toEqual([1, 2, 3, 4, 5]);
      expect(schedule.startTime).toBe('08:00');
      expect(schedule.endTime).toBe('17:00');
      expect(schedule.slotDurationMinutes).toBe(30);
      expect(schedule.breakStart).toBeNull();
      expect(schedule.breakEnd).toBeNull();
    });
  });
});
