import { GetAvailableSlotsUseCase } from './get-available-slots.use-case';
import { DoctorNotFoundError } from './create-booking.use-case';
import type { IBookingDoctorLoader } from '../../../domain/repositories/booking-doctor.repository';
import type { IDoctorScheduleRepository } from '../../../../doctor-settings/domain/repositories/doctor-schedule.repository';
import type { IAppointmentRepository } from '../../../../appointments/domain/repositories/appointment.repository';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../../appointments/domain/entities/appointment.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const DATE_STR = '2026-06-10'; // Tuesday — in DEFAULT_SCHEDULE workDays [1-5]

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  const base = new Date('2026-06-10T08:00:00.000Z');
  return Appointment.create({
    id: 'appt-1',
    doctorId: DOCTOR_ID,
    patientId: 'patient-1',
    authUserId: null,
    consultationId: null,
    patientName: 'Juan P.',
    patientPhone: null,
    patientEmail: null,
    patientCedula: null,
    scheduledAt: base,
    status: 'scheduled',
    appointmentMode: 'presencial',
    source: null,
    planName: 'Consulta',
    planPrice: 30,
    paymentMethod: null,
    paymentReference: null,
    paymentReceiptUrl: null,
    insuranceName: null,
    bcvRate: null,
    amountBs: null,
    packageId: null,
    sessionNumber: null,
    chiefComplaint: null,
    appointmentCode: null,
    createdAt: base,
    updatedAt: base,
    ...overrides,
  });
}

function makeDoctorLoader(isActive = true): jest.Mocked<IBookingDoctorLoader> {
  return {
    findById: jest.fn().mockResolvedValue(isActive ? { id: DOCTOR_ID, isActive: true } : null),
  } as unknown as jest.Mocked<IBookingDoctorLoader>;
}

function makeScheduleRepo(): jest.Mocked<IDoctorScheduleRepository> {
  return {
    findByDoctorId: jest.fn().mockResolvedValue(null), // null → default schedule
    upsert: jest.fn(),
  } as jest.Mocked<IDoctorScheduleRepository>;
}

function makeAppointmentRepo(occupied: Appointment[] = []): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    list: jest.fn(),
    save: jest.fn(),
    updateStatus: jest.fn(),
    updateScheduledAt: jest.fn(),
    hasSlotConflict: jest.fn(),
    hasDuplicate: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue(occupied),
  } as jest.Mocked<IAppointmentRepository>;
}

describe('GetAvailableSlotsUseCase', () => {
  let useCase: GetAvailableSlotsUseCase;
  let doctorLoader: jest.Mocked<IBookingDoctorLoader>;
  let scheduleRepo: jest.Mocked<IDoctorScheduleRepository>;
  let appointmentRepo: jest.Mocked<IAppointmentRepository>;

  beforeEach(() => {
    doctorLoader = makeDoctorLoader();
    scheduleRepo = makeScheduleRepo();
    appointmentRepo = makeAppointmentRepo();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);
  });

  describe('anti-enumeration', () => {
    it('throws DoctorNotFoundError when doctor does not exist', async () => {
      doctorLoader.findById.mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);

      await expect(useCase.execute(DOCTOR_ID, DATE_STR)).rejects.toBeInstanceOf(
        DoctorNotFoundError,
      );
    });

    it('throws DoctorNotFoundError when doctor is inactive', async () => {
      doctorLoader.findById.mockResolvedValue({ id: DOCTOR_ID, isActive: false } as never);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);

      await expect(useCase.execute(DOCTOR_ID, DATE_STR)).rejects.toBeInstanceOf(
        DoctorNotFoundError,
      );
    });
  });

  describe('default schedule (no DB schedule)', () => {
    it('returns slots for a working day using DEFAULT_SCHEDULE', async () => {
      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.date).toBe(DATE_STR);
      expect(result.slots.length).toBeGreaterThan(0);
      // Default: 08:00–17:00, 30 min slots → first slot 08:00
      expect(result.slots[0]!.time).toBe('08:00');
      // All slots available when no appointments exist
      result.slots.forEach((s) => expect(s.available).toBe(true));
    });

    it('returns empty slots array for a weekend day (Sunday=0) with default schedule', async () => {
      // 2026-06-07 is a Sunday
      const result = await useCase.execute(DOCTOR_ID, '2026-06-07');
      expect(result.slots).toHaveLength(0);
    });
  });

  describe('occupied slot detection', () => {
    it('marks an occupied slot as available=false', async () => {
      const occupiedAppt = makeAppointment({
        scheduledAt: new Date('2026-06-10T08:00:00.000Z'),
      });
      appointmentRepo = makeAppointmentRepo([occupiedAppt]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const first = result.slots.find((s) => s.time === '08:00');
      expect(first).toBeDefined();
      expect(first?.available).toBe(false);
    });

    it('leaves other slots available when only one slot is occupied', async () => {
      const occupiedAppt = makeAppointment({
        scheduledAt: new Date('2026-06-10T08:00:00.000Z'),
      });
      appointmentRepo = makeAppointmentRepo([occupiedAppt]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const availableSlots = result.slots.filter((s) => s.available);
      expect(availableSlots.length).toBeGreaterThan(0);
      const unavailableSlots = result.slots.filter((s) => !s.available);
      expect(unavailableSlots).toHaveLength(1);
      expect(unavailableSlots[0]!.time).toBe('08:00');
    });
  });

  describe('custom schedule', () => {
    it('uses the doctor-configured schedule when one exists', async () => {
      scheduleRepo.findByDoctorId.mockResolvedValue({
        workDays: [1, 2, 3, 4, 5], // Mon-Fri
        startTime: '09:00',
        endTime: '13:00',
        slotDurationMinutes: 60,
        breakStart: null,
        breakEnd: null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // 09:00, 10:00, 11:00, 12:00 → 4 slots of 60 min
      expect(result.slots).toHaveLength(4);
      expect(result.slots[0]!.time).toBe('09:00');
      expect(result.slots[3]!.time).toBe('12:00');
    });

    it('respects break windows and excludes overlapping slots', async () => {
      scheduleRepo.findByDoctorId.mockResolvedValue({
        workDays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
        breakStart: '12:00',
        breakEnd: '13:00',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase = new GetAvailableSlotsUseCase(doctorLoader as any, scheduleRepo, appointmentRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const times = result.slots.map((s) => s.time);
      // 12:00 and 12:30 overlap with the break window → excluded
      expect(times).not.toContain('12:00');
      expect(times).not.toContain('12:30');
      // 11:30 ends at 12:00 → boundary: valid (slot end equals break start, no overlap)
      expect(times).toContain('11:30');
      // 13:00 starts after break → valid
      expect(times).toContain('13:00');
    });
  });

  describe('queries', () => {
    it('queries appointments for the correct doctor and full day range', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(appointmentRepo.findActiveByDoctorAndDateRange).toHaveBeenCalledWith(
        DOCTOR_ID,
        new Date('2026-06-10T00:00:00.000Z'),
        new Date('2026-06-10T23:59:59.999Z'),
      );
    });

    it('does not query appointments when the day has no theoretical slots', async () => {
      // Sunday with default schedule → 0 theoretical slots
      await useCase.execute(DOCTOR_ID, '2026-06-07');

      expect(appointmentRepo.findActiveByDoctorAndDateRange).not.toHaveBeenCalled();
    });
  });
});
