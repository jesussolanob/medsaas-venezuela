import { GetMeetingSlotsUseCase } from './get-meeting-slots.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';

const CARACAS_OFFSET = '-04:00';

/** Builds a UTC Date from a Caracas local date+time string. */
function caracas(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00.000${CARACAS_OFFSET}`);
}

describe('GetMeetingSlotsUseCase', () => {
  let useCase: GetMeetingSlotsUseCase;
  let repo: jest.Mocked<ITeamMeetingRepository>;

  beforeEach(() => {
    repo = {
      getActiveOfficeSchedules: jest.fn(),
      getAppointmentsInRange: jest.fn(),
      getAvailabilityBlocksInRange: jest.fn(),
      create: jest.fn(),
      findScheduledByDoctor: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      listWithDoctor: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      getSettings: jest.fn(),
      updateSetting: jest.fn(),
      getDoctorProfile: jest.fn(),
      findMeetingsNeedingReminder: jest.fn(),
      markReminder24hSent: jest.fn(),
      markReminder1hSent: jest.fn(),
    } as jest.Mocked<ITeamMeetingRepository>;

    useCase = new GetMeetingSlotsUseCase(repo);
  });

  describe('usesGenericHours', () => {
    it('returns usesGenericHours=true when doctor has no active offices', async () => {
      // A Friday in Venezuela (2026-10-30 is a Friday)
      jest.useFakeTimers().setSystemTime(caracas('2026-10-30', '06:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([]);
      repo.getAppointmentsInRange.mockResolvedValue([]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.usesGenericHours).toBe(true);
      jest.useRealTimers();
    });

    it('returns usesGenericHours=false when doctor has offices', async () => {
      jest.useFakeTimers().setSystemTime(caracas('2026-10-30', '06:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([
        { officeDay: 4, startTime: '09:00', endTime: '12:00', slotDuration: 30, bufferMinutes: 0 },
      ]);
      repo.getAppointmentsInRange.mockResolvedValue([]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.usesGenericHours).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('generic hours mode (no offices)', () => {
    it('generates Mon-Sat 08:00-18:00 slots in 30-min steps', async () => {
      // Monday 2026-11-02 at 05:00 Caracas → all day slots are ≥ now+2h
      jest.useFakeTimers().setSystemTime(caracas('2026-11-02', '05:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([]);
      repo.getAppointmentsInRange.mockResolvedValue([]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.usesGenericHours).toBe(true);
      expect(result.days).toHaveLength(1);
      // 08:00 to 17:30 = 20 slots
      expect(result.days[0]!.slots).toContain('08:00');
      expect(result.days[0]!.slots).toContain('17:30');
      expect(result.days[0]!.slots).not.toContain('18:00');
      jest.useRealTimers();
    });

    it('does not generate Sunday slots', async () => {
      // Sunday 2026-11-01 at 05:00 Caracas
      jest.useFakeTimers().setSystemTime(caracas('2026-11-01', '05:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([]);
      repo.getAppointmentsInRange.mockResolvedValue([]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.days).toHaveLength(0);
      jest.useRealTimers();
    });
  });

  describe('≥ now + 2h filter', () => {
    it('excludes slots within 2 hours from now', async () => {
      // Monday 09:00 Caracas → slots at 08:00, 08:30, 09:00, 09:30 should be excluded
      jest.useFakeTimers().setSystemTime(caracas('2026-11-02', '09:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([]);
      repo.getAppointmentsInRange.mockResolvedValue([]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.days[0]!.slots).not.toContain('08:00');
      expect(result.days[0]!.slots).not.toContain('09:00');
      expect(result.days[0]!.slots).not.toContain('10:00');
      // 11:00 is exactly 2h from 09:00 — must be excluded (need > 2h)
      expect(result.days[0]!.slots).not.toContain('11:00');
      // 11:30 = 2.5h from 09:00 — must be included
      expect(result.days[0]!.slots).toContain('11:30');
      jest.useRealTimers();
    });
  });

  describe('appointment blocking', () => {
    it('excludes slots blocked by existing appointments', async () => {
      // Monday 06:00 Caracas → all slots future
      jest.useFakeTimers().setSystemTime(caracas('2026-11-02', '06:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([
        { officeDay: 0, startTime: '09:00', endTime: '12:00', slotDuration: 30, bufferMinutes: 0 },
      ]);
      // Appointment at 10:00–10:30
      repo.getAppointmentsInRange.mockResolvedValue([
        { scheduledAt: caracas('2026-11-02', '10:00'), durationMinutes: 30 },
      ]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.days[0]!.slots).not.toContain('10:00');
      expect(result.days[0]!.slots).toContain('09:00');
      expect(result.days[0]!.slots).toContain('09:30');
      expect(result.days[0]!.slots).toContain('10:30');
      jest.useRealTimers();
    });
  });

  describe('availability block filtering', () => {
    it('excludes slots covered by an availability block', async () => {
      jest.useFakeTimers().setSystemTime(caracas('2026-11-02', '06:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([
        { officeDay: 0, startTime: '09:00', endTime: '12:00', slotDuration: 30, bufferMinutes: 0 },
      ]);
      repo.getAppointmentsInRange.mockResolvedValue([]);
      // Block from 09:30 to 10:30
      repo.getAvailabilityBlocksInRange.mockResolvedValue([
        {
          startsAt: caracas('2026-11-02', '09:30'),
          endsAt: caracas('2026-11-02', '10:30'),
        },
      ]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.days[0]!.slots).toContain('09:00');
      expect(result.days[0]!.slots).not.toContain('09:30');
      expect(result.days[0]!.slots).not.toContain('10:00');
      expect(result.days[0]!.slots).toContain('10:30');
      jest.useRealTimers();
    });
  });

  describe('days with no slots are omitted', () => {
    it('omits days with no available slots from the result', async () => {
      // All slots blocked by appointments
      jest.useFakeTimers().setSystemTime(caracas('2026-11-02', '06:00'));
      repo.getActiveOfficeSchedules.mockResolvedValue([
        { officeDay: 0, startTime: '09:00', endTime: '10:00', slotDuration: 30, bufferMinutes: 0 },
      ]);
      repo.getAppointmentsInRange.mockResolvedValue([
        { scheduledAt: caracas('2026-11-02', '09:00'), durationMinutes: 60 },
      ]);
      repo.getAvailabilityBlocksInRange.mockResolvedValue([]);

      const result = await useCase.execute('doctor-1', 1);

      expect(result.days).toHaveLength(0);
      jest.useRealTimers();
    });
  });
});
