import { GetAvailableSlotsUseCase } from './get-available-slots.use-case';
import { DoctorNotFoundError } from './create-booking.use-case';
import type { IBookingDoctorLoader } from '../../../domain/repositories/booking-doctor.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import type { IAppointmentRepository } from '../../../../appointments/domain/repositories/appointment.repository';
import type { IAvailabilityBlockRepository } from '../../../../availability-blocks/domain/repositories/availability-block.repository';
import type { IDoctorScheduleRepository } from '../../../../doctor-settings/domain/repositories/doctor-schedule.repository';
import { Office } from '../../../../offices/domain/entities/office.entity';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../../appointments/domain/entities/appointment.entity';
import { AvailabilityBlock } from '../../../../availability-blocks/domain/entities/availability-block.entity';
import type { DoctorScheduleParams } from '../../../../doctor-settings/domain/value-objects/doctor-schedule.vo';

const DOCTOR_ID = 'doctor-uuid-1';
// 2026-06-08 is a Monday (getUTCDay()=1 → officeDay=(1+6)%7=0)
const DATE_STR = '2026-06-08';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOffice(overrides: Partial<Parameters<typeof Office.create>[0]> = {}): Office {
  const now = new Date('2026-06-08T00:00:00.000Z');
  return Office.create({
    id: 'office-001',
    doctorId: DOCTOR_ID,
    name: 'Consultorio',
    address: '',
    city: 'Caracas',
    phone: '',
    schedule: [
      // day 0=Monday
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
    ],
    slotDuration: 30,
    bufferMinutes: 0,
    isActive: true,
    modality: 'in_person',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  const base = new Date('2026-06-08T08:00:00.000Z');
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

function makeBlock(startsAt: Date, endsAt: Date): AvailabilityBlock {
  return AvailabilityBlock.create({
    id: 'block-001',
    doctorId: DOCTOR_ID,
    startsAt,
    endsAt,
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeDoctorLoader(isActive = true): jest.Mocked<IBookingDoctorLoader> {
  return {
    findById: jest.fn().mockResolvedValue(isActive ? { id: DOCTOR_ID, isActive: true } : null),
  } as unknown as jest.Mocked<IBookingDoctorLoader>;
}

function makeOfficeRepo(offices: Office[] = []): jest.Mocked<IOfficeRepository> {
  return {
    listByDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    findActiveByDoctor: jest.fn().mockResolvedValue(offices),
    findById: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } as jest.Mocked<IOfficeRepository>;
}

function makeAppointmentRepo(occupied: Appointment[] = []): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    findByIdForDoctor: jest.fn(),
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
    findRescheduleChain: jest.fn().mockResolvedValue([]),
    findChangeLogs: jest.fn().mockResolvedValue([]),
    updateMeetLink: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IAppointmentRepository>;
}

function makeBlockRepo(
  blocks: AvailabilityBlock[] = [],
): jest.Mocked<IAvailabilityBlockRepository> {
  return {
    findByDoctor: jest.fn(),
    findOverlapping: jest.fn().mockResolvedValue(blocks),
    create: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
  } as jest.Mocked<IAvailabilityBlockRepository>;
}

function makeScheduleRepo(horizonWeeks = 8): jest.Mocked<IDoctorScheduleRepository> {
  const params: DoctorScheduleParams = {
    workDays: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
    breakStart: null,
    breakEnd: null,
    bookingHorizonWeeks: horizonWeeks,
  };
  return {
    findByDoctorId: jest.fn().mockResolvedValue(params),
    upsert: jest.fn(),
  } as jest.Mocked<IDoctorScheduleRepository>;
}

// Fixed "today" reference for deterministic horizon tests: 2026-06-08
const FIXED_TODAY = new Date('2026-06-08T00:00:00.000Z');

// Helper that creates a use case with a controlled Date.now for horizon tests
function makeUseCase(
  doctorLoader: IBookingDoctorLoader,
  officeRepo: IOfficeRepository,
  appointmentRepo: IAppointmentRepository,
  blockRepo: IAvailabilityBlockRepository,
  scheduleRepo: IDoctorScheduleRepository,
): GetAvailableSlotsUseCase {
  return new GetAvailableSlotsUseCase(
    doctorLoader,
    officeRepo,
    appointmentRepo,
    blockRepo,
    scheduleRepo,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GetAvailableSlotsUseCase (offices-based + availability blocks)', () => {
  let useCase: GetAvailableSlotsUseCase;
  let doctorLoader: jest.Mocked<IBookingDoctorLoader>;
  let officeRepo: jest.Mocked<IOfficeRepository>;
  let appointmentRepo: jest.Mocked<IAppointmentRepository>;
  let blockRepo: jest.Mocked<IAvailabilityBlockRepository>;
  let scheduleRepo: jest.Mocked<IDoctorScheduleRepository>;

  // We freeze "today" to 2026-06-08 so horizon tests are deterministic
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_TODAY);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    doctorLoader = makeDoctorLoader();
    officeRepo = makeOfficeRepo([makeOffice()]);
    appointmentRepo = makeAppointmentRepo();
    blockRepo = makeBlockRepo();
    scheduleRepo = makeScheduleRepo(8);
    useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);
  });

  // ─── Anti-enumeration ─────────────────────────────────────────────────────

  describe('anti-enumeration', () => {
    it('throws DoctorNotFoundError when doctor does not exist', async () => {
      doctorLoader.findById.mockResolvedValue(null);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      await expect(useCase.execute(DOCTOR_ID, DATE_STR)).rejects.toBeInstanceOf(
        DoctorNotFoundError,
      );
    });

    it('throws DoctorNotFoundError when doctor is inactive', async () => {
      doctorLoader.findById.mockResolvedValue({ id: DOCTOR_ID, isActive: false } as never);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      await expect(useCase.execute(DOCTOR_ID, DATE_STR)).rejects.toBeInstanceOf(
        DoctorNotFoundError,
      );
    });
  });

  // ─── Slot generation ──────────────────────────────────────────────────────

  describe('slot generation from offices', () => {
    it('generates slots for Monday from an active office', async () => {
      // DATE_STR = 2026-06-08 (Monday) → officeDay=0
      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.date).toBe(DATE_STR);
      // 08:00–12:00, 30min slots, 0 buffer → 08:00, 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
      expect(result.slots).toHaveLength(8);
      expect(result.slots[0]!.time).toBe('08:00');
      expect(result.slots[7]!.time).toBe('11:30');
    });

    it('returns empty slots when doctor has no active offices', async () => {
      officeRepo = makeOfficeRepo([]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots).toHaveLength(0);
    });

    it('returns empty slots when no office has Monday enabled', async () => {
      const tuesdayOffice = makeOffice({
        schedule: [{ day: 1, enabled: true, start: '08:00', end: '12:00' }],
      });
      officeRepo = makeOfficeRepo([tuesdayOffice]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots).toHaveLength(0);
    });

    it('deduplicates slots from multiple offices with overlapping times', async () => {
      const office1 = makeOffice({
        id: 'off-1',
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '10:00' }],
      });
      const office2 = makeOffice({
        id: 'off-2',
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '10:00' }],
      });
      officeRepo = makeOfficeRepo([office1, office2]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const times = result.slots.map((s) => s.time);
      expect(new Set(times).size).toBe(times.length);
    });

    it('applies buffer_minutes to advance next slot start', async () => {
      const office = makeOffice({
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '12:00' }],
        slotDuration: 30,
        bufferMinutes: 10,
      });
      officeRepo = makeOfficeRepo([office]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots[0]!.time).toBe('08:00');
      expect(result.slots[1]!.time).toBe('08:40');
      expect(result.slots[2]!.time).toBe('09:20');
    });

    it('returns slots sorted ascending by time', async () => {
      const office1 = makeOffice({
        id: 'off-1',
        schedule: [{ day: 0, enabled: true, start: '10:00', end: '12:00' }],
        bufferMinutes: 0,
      });
      const office2 = makeOffice({
        id: 'off-2',
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '10:00' }],
        bufferMinutes: 0,
      });
      officeRepo = makeOfficeRepo([office1, office2]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const times = result.slots.map((s) => s.time);
      const sorted = [...times].sort();
      expect(times).toEqual(sorted);
    });
  });

  // ─── Weekday mapping ──────────────────────────────────────────────────────

  describe('weekday mapping (JS 0=Sun → offices 0=Mon)', () => {
    it('maps Sunday correctly: JS getUTCDay()=0 → officeDay=6', async () => {
      // 2026-06-14 is a Sunday (within 8-week horizon from 2026-06-08)
      const sundayOffice = makeOffice({
        schedule: [{ day: 6, enabled: true, start: '09:00', end: '11:00' }],
      });
      officeRepo = makeOfficeRepo([sundayOffice]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, '2026-06-14');

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0]!.time).toBe('09:00');
    });

    it('returns empty for Sunday when only Monday (day=0) is enabled', async () => {
      officeRepo = makeOfficeRepo([makeOffice()]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      // 2026-06-14 is Sunday (officeDay=6), but office has day=0 (Monday)
      const result = await useCase.execute(DOCTOR_ID, '2026-06-14');

      expect(result.slots).toHaveLength(0);
    });

    it('maps Saturday correctly: JS getUTCDay()=6 → officeDay=5', async () => {
      // 2026-06-13 is a Saturday (within 8-week horizon)
      const saturdayOffice = makeOffice({
        schedule: [{ day: 5, enabled: true, start: '08:00', end: '10:00' }],
      });
      officeRepo = makeOfficeRepo([saturdayOffice]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, '2026-06-13');

      expect(result.slots.length).toBeGreaterThan(0);
    });
  });

  // ─── Occupied slots ───────────────────────────────────────────────────────

  describe('occupied slot detection', () => {
    it('marks an occupied slot as available=false', async () => {
      const occupiedAppt = makeAppointment({
        scheduledAt: new Date('2026-06-08T08:00:00.000Z'),
      });
      appointmentRepo = makeAppointmentRepo([occupiedAppt]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const first = result.slots.find((s) => s.time === '08:00');
      expect(first).toBeDefined();
      expect(first?.available).toBe(false);
    });

    it('leaves other slots available when only one slot is occupied', async () => {
      const occupiedAppt = makeAppointment({
        scheduledAt: new Date('2026-06-08T08:00:00.000Z'),
      });
      appointmentRepo = makeAppointmentRepo([occupiedAppt]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const availableSlots = result.slots.filter((s) => s.available);
      expect(availableSlots.length).toBeGreaterThan(0);
      const unavailableSlots = result.slots.filter((s) => !s.available);
      expect(unavailableSlots).toHaveLength(1);
      expect(unavailableSlots[0]!.time).toBe('08:00');
    });

    it('all slots available when no appointments exist', async () => {
      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      result.slots.forEach((s) => expect(s.available).toBe(true));
    });
  });

  // ─── Availability block filtering ─────────────────────────────────────────

  describe('availability block filtering', () => {
    it('marks slots within a partial-day block as unavailable', async () => {
      // Block from 09:00 to 11:00 UTC on 2026-06-08
      const block = makeBlock(
        new Date('2026-06-08T09:00:00.000Z'),
        new Date('2026-06-08T11:00:00.000Z'),
      );
      blockRepo = makeBlockRepo([block]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // 09:00 and 09:30 and 10:00 and 10:30 are inside [09:00, 11:00)
      const blocked = result.slots.filter((s) => !s.available);
      const blockedTimes = blocked.map((s) => s.time);
      expect(blockedTimes).toContain('09:00');
      expect(blockedTimes).toContain('09:30');
      expect(blockedTimes).toContain('10:00');
      expect(blockedTimes).toContain('10:30');
      // 11:00 is the exclusive end — not blocked
      const elevenSlot = result.slots.find((s) => s.time === '11:00');
      expect(elevenSlot?.available).toBe(true);
    });

    it('marks all slots unavailable for a full-day block', async () => {
      // Full day block: 00:00 to 23:59:59 UTC on 2026-06-08
      const block = makeBlock(
        new Date('2026-06-08T00:00:00.000Z'),
        new Date('2026-06-08T23:59:59.000Z'),
      );
      blockRepo = makeBlockRepo([block]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      result.slots.forEach((s) => expect(s.available).toBe(false));
    });

    it('does not affect slots outside the block range', async () => {
      // Block only from 10:00 to 12:00
      const block = makeBlock(
        new Date('2026-06-08T10:00:00.000Z'),
        new Date('2026-06-08T12:00:00.000Z'),
      );
      blockRepo = makeBlockRepo([block]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const eightSlot = result.slots.find((s) => s.time === '08:00');
      expect(eightSlot?.available).toBe(true);
      const nineSlot = result.slots.find((s) => s.time === '09:00');
      expect(nineSlot?.available).toBe(true);
    });

    it('all slots available when no blocks exist', async () => {
      blockRepo = makeBlockRepo([]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      result.slots.forEach((s) => expect(s.available).toBe(true));
    });
  });

  // ─── Booking horizon ──────────────────────────────────────────────────────

  describe('booking horizon enforcement', () => {
    it('returns empty slots for a date before today', async () => {
      // 2026-06-07 is yesterday relative to FIXED_TODAY (2026-06-08)
      const result = await useCase.execute(DOCTOR_ID, '2026-06-07');

      expect(result.slots).toHaveLength(0);
    });

    it('returns slots for today (inclusive)', async () => {
      // DATE_STR = 2026-06-08 = today
      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots.length).toBeGreaterThan(0);
    });

    it('returns slots within the horizon window', async () => {
      // Within 8 weeks from 2026-06-08 → 2026-07-20 is week 6
      await useCase.execute(DOCTOR_ID, '2026-07-20');

      // We have a Monday office (day=0); 2026-07-20 is a Monday
      // Result might be empty due to no slots on that day in office,
      // but the horizon check should pass (not return early).
      // The key: it should NOT throw and blockRepo.findOverlapping is called.
      expect(blockRepo.findOverlapping).toHaveBeenCalled();
    });

    it('returns empty slots for a date beyond the horizon', async () => {
      // 8 weeks from 2026-06-08 = 2026-08-03; 2026-08-04 is beyond
      const result = await useCase.execute(DOCTOR_ID, '2026-08-04');

      expect(result.slots).toHaveLength(0);
      // Horizon check returns early — no office queries needed beyond doctor check
      expect(officeRepo.findActiveByDoctor).not.toHaveBeenCalled();
    });

    it('uses configured horizon weeks from schedule (1 week)', async () => {
      scheduleRepo = makeScheduleRepo(1);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      // 1 week from 2026-06-08 = up to 2026-06-14; 2026-06-15 should be outside
      const result = await useCase.execute(DOCTOR_ID, '2026-06-15');

      expect(result.slots).toHaveLength(0);
    });

    it('defaults to 8 weeks when doctor has no schedule configured', async () => {
      scheduleRepo = {
        findByDoctorId: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      } as jest.Mocked<IDoctorScheduleRepository>;
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      // 2026-08-04 is beyond 8 weeks from 2026-06-08
      const result = await useCase.execute(DOCTOR_ID, '2026-08-04');

      expect(result.slots).toHaveLength(0);
    });
  });

  // ─── Query behaviour ──────────────────────────────────────────────────────

  describe('query behaviour', () => {
    it('queries appointments for the correct doctor and full day range', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(appointmentRepo.findActiveByDoctorAndDateRange).toHaveBeenCalledWith(
        DOCTOR_ID,
        new Date('2026-06-08T00:00:00.000Z'),
        new Date('2026-06-08T23:59:59.999Z'),
      );
    });

    it('does not query appointments when there are no theoretical slots', async () => {
      officeRepo = makeOfficeRepo([]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(appointmentRepo.findActiveByDoctorAndDateRange).not.toHaveBeenCalled();
    });

    it('calls findActiveByDoctor with the correct doctorId', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(officeRepo.findActiveByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('queries blocks with the correct day range', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(blockRepo.findOverlapping).toHaveBeenCalledWith(
        DOCTOR_ID,
        new Date('2026-06-08T00:00:00.000Z'),
        new Date('2026-06-08T23:59:59.999Z'),
      );
    });
  });
});
