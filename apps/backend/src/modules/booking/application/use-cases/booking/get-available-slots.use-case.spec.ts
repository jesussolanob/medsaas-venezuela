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
// 2026-06-08 is a Monday.
// FIXED_TODAY is set to noon UTC (08:00 Caracas) so that both UTC and
// America/Caracas calendar dates agree on "2026-06-08".
const DATE_STR = '2026-06-08';

// Caracas offset constant — mirrors the one used in the use case.
const CARACAS = '-04:00';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOffice(overrides: Partial<Parameters<typeof Office.create>[0]> = {}): Office {
  const now = new Date('2026-06-08T12:00:00.000Z');
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
  // Default: 08:00 Caracas = 12:00 UTC on 2026-06-08
  const base = new Date('2026-06-08T12:00:00.000Z');
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

/**
 * Creates an AvailabilityBlock using Caracas wall-clock times expressed with the
 * -04:00 offset, matching how the use case materialises dayStart/dayEnd.
 */
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
    hasOverlap: jest.fn(),
    hasPatientOverlap: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue(occupied),
    updateMeetLink: jest.fn().mockResolvedValue(undefined),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
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

function makeScheduleRepo(
  horizonWeeks = 8,
  minLeadDays = 0,
): jest.Mocked<IDoctorScheduleRepository> {
  const params: DoctorScheduleParams = {
    workDays: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
    breakStart: null,
    breakEnd: null,
    bookingHorizonWeeks: horizonWeeks,
    bookingMinLeadDays: minLeadDays,
    bookingRequireReason: false,
  };
  return {
    findByDoctorId: jest.fn().mockResolvedValue(params),
    upsert: jest.fn(),
  } as jest.Mocked<IDoctorScheduleRepository>;
}

// Fixed "today" reference for deterministic horizon tests: 2026-06-08 noon UTC
// (= 08:00 Caracas), so Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' })
// returns '2026-06-08' and both UTC and Caracas calendars agree on the date.
const FIXED_TODAY = new Date('2026-06-08T12:00:00.000Z');

// Caracas midnight on DATE_STR expressed as a UTC instant (dayStart in use case)
const DAY_START_CARACAS = new Date(`${DATE_STR}T00:00:00.000${CARACAS}`);
// Caracas end-of-day on DATE_STR expressed as a UTC instant (dayEnd in use case)
const DAY_END_CARACAS = new Date(`${DATE_STR}T23:59:59.999${CARACAS}`);

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

  // Freeze system time at noon UTC on 2026-06-08 (= 08:00 Caracas).
  // This ensures Intl.DateTimeFormat in the use case returns '2026-06-08' as
  // "today in Caracas", making horizon checks deterministic.
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

    it('generates the union of slots from two blocks on the same day (morning + afternoon)', async () => {
      // Single office with two Monday blocks: 08:00-10:00 and 15:00-17:00
      const officeWithTwoBlocks = makeOffice({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '10:00' },
          { day: 0, enabled: true, start: '15:00', end: '17:00' },
        ],
        slotDuration: 30,
        bufferMinutes: 0,
      });
      officeRepo = makeOfficeRepo([officeWithTwoBlocks]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // Morning: 08:00, 08:30, 09:00, 09:30 (4 slots)
      // Afternoon: 15:00, 15:30, 16:00, 16:30 (4 slots)
      expect(result.slots).toHaveLength(8);
      const times = result.slots.map((s) => s.time);
      expect(times).toContain('08:00');
      expect(times).toContain('09:30');
      expect(times).toContain('15:00');
      expect(times).toContain('16:30');
      // Verify no gap-time slots appear between blocks
      expect(times).not.toContain('10:00');
      expect(times).not.toContain('14:30');
    });

    it('deduplicates slots when two blocks on the same day produce identical times', async () => {
      // Same office, same day, two identical blocks — deduplicated by Set<string>
      const officeWithDuplicateBlocks = makeOffice({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '10:00' },
          { day: 0, enabled: true, start: '08:00', end: '10:00' },
        ],
        slotDuration: 30,
        bufferMinutes: 0,
      });
      officeRepo = makeOfficeRepo([officeWithDuplicateBlocks]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const times = result.slots.map((s) => s.time);
      expect(new Set(times).size).toBe(times.length); // no duplicates
      expect(result.slots).toHaveLength(4); // 08:00, 08:30, 09:00, 09:30
    });

    it('skips a block where start >= end even when another block on the same day is valid', async () => {
      // First block valid, second block has start=end (should be skipped)
      const officeWithBadSecondBlock = makeOffice({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '10:00' },
          { day: 0, enabled: true, start: '15:00', end: '15:00' }, // zero-length, skipped
        ],
        slotDuration: 30,
        bufferMinutes: 0,
      });
      officeRepo = makeOfficeRepo([officeWithBadSecondBlock]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // Only morning slots — bad block produces nothing
      const times = result.slots.map((s) => s.time);
      expect(times).toContain('08:00');
      expect(times).not.toContain('15:00');
    });
  });

  // ─── Weekday mapping ──────────────────────────────────────────────────────

  describe('weekday mapping (JS 0=Sun → offices 0=Mon)', () => {
    it('maps Sunday correctly: getUTCDay()=0 on Caracas-midnight → officeDay=6', async () => {
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

    it('maps Saturday correctly: getUTCDay()=6 on Caracas-midnight → officeDay=5', async () => {
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
      // 08:00 Caracas = 12:00 UTC (UTC day is still 2026-06-08)
      const occupiedAppt = makeAppointment({
        scheduledAt: new Date(`2026-06-08T08:00:00.000${CARACAS}`),
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
        scheduledAt: new Date(`2026-06-08T08:00:00.000${CARACAS}`),
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

    // ─── Near-midnight Caracas correctness ──────────────────────────────────

    it('marks 20:00 Caracas slot occupied when appointment is at 20:00 Caracas (00:00 UTC next day)', async () => {
      // An office with evening slots: 20:00–22:00 Caracas
      const eveningOffice = makeOffice({
        schedule: [{ day: 0, enabled: true, start: '20:00', end: '22:00' }],
      });
      officeRepo = makeOfficeRepo([eveningOffice]);

      // 20:00 Caracas = 00:00 UTC on 2026-06-09 (next UTC day)
      const appt = makeAppointment({
        scheduledAt: new Date(`2026-06-08T20:00:00.000${CARACAS}`),
      });
      appointmentRepo = makeAppointmentRepo([appt]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const slot = result.slots.find((s) => s.time === '20:00');
      expect(slot).toBeDefined();
      expect(slot?.available).toBe(false);
    });

    it('a 20:00 Caracas slot appears in the DATE_STR day (not lost to UTC day change)', async () => {
      const eveningOffice = makeOffice({
        schedule: [{ day: 0, enabled: true, start: '20:00', end: '22:00' }],
      });
      officeRepo = makeOfficeRepo([eveningOffice]);
      appointmentRepo = makeAppointmentRepo([]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.date).toBe(DATE_STR);
      const times = result.slots.map((s) => s.time);
      expect(times).toContain('20:00');
      expect(times).toContain('20:30');
      expect(times).toContain('21:00');
      expect(times).toContain('21:30');
    });

    it('a 00:30 Caracas appointment occupies the 00:30 slot on the same Caracas day', async () => {
      // DATE_STR_NEXT for the second day in sequence: 2026-06-09 (Tuesday)
      const nextDate = '2026-06-09';
      const midnightOffice = makeOffice({
        // day=1 = Tuesday in offices scheme
        schedule: [{ day: 1, enabled: true, start: '00:00', end: '02:00' }],
      });
      officeRepo = makeOfficeRepo([midnightOffice]);

      // 00:30 Caracas on 2026-06-09 = 04:30 UTC on 2026-06-09
      const appt = makeAppointment({
        scheduledAt: new Date(`2026-06-09T00:30:00.000${CARACAS}`),
      });
      appointmentRepo = makeAppointmentRepo([appt]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, nextDate);

      const slot = result.slots.find((s) => s.time === '00:30');
      expect(slot).toBeDefined();
      expect(slot?.available).toBe(false);
      // 00:00 slot on the same day should remain available
      const zeroSlot = result.slots.find((s) => s.time === '00:00');
      expect(zeroSlot?.available).toBe(true);
    });
  });

  // ─── Availability block filtering ─────────────────────────────────────────

  describe('availability block filtering', () => {
    it('marks slots within a partial-day block as unavailable', async () => {
      // Block from 09:00 to 11:00 Caracas on 2026-06-08
      const block = makeBlock(
        new Date(`2026-06-08T09:00:00.000${CARACAS}`),
        new Date(`2026-06-08T11:00:00.000${CARACAS}`),
      );
      blockRepo = makeBlockRepo([block]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // 09:00, 09:30, 10:00, 10:30 are inside [09:00, 11:00) Caracas
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
      // Full day block: 00:00 to 23:59:59 Caracas on 2026-06-08
      const block = makeBlock(
        new Date(`2026-06-08T00:00:00.000${CARACAS}`),
        new Date(`2026-06-08T23:59:59.000${CARACAS}`),
      );
      blockRepo = makeBlockRepo([block]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      result.slots.forEach((s) => expect(s.available).toBe(false));
    });

    it('does not affect slots outside the block range', async () => {
      // Block only from 10:00 to 12:00 Caracas
      const block = makeBlock(
        new Date(`2026-06-08T10:00:00.000${CARACAS}`),
        new Date(`2026-06-08T12:00:00.000${CARACAS}`),
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

    it('evening slot at 20:00 Caracas is blocked by a 19:00–21:00 Caracas block', async () => {
      const eveningOffice = makeOffice({
        schedule: [{ day: 0, enabled: true, start: '19:00', end: '22:00' }],
      });
      officeRepo = makeOfficeRepo([eveningOffice]);

      const block = makeBlock(
        new Date(`2026-06-08T19:00:00.000${CARACAS}`),
        new Date(`2026-06-08T21:00:00.000${CARACAS}`),
      );
      blockRepo = makeBlockRepo([block]);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const slot20 = result.slots.find((s) => s.time === '20:00');
      expect(slot20?.available).toBe(false);
      // 21:00 is the exclusive end — not blocked
      const slot21 = result.slots.find((s) => s.time === '21:00');
      expect(slot21?.available).toBe(true);
    });
  });

  // ─── Booking horizon ──────────────────────────────────────────────────────

  describe('booking horizon enforcement', () => {
    it('returns empty slots for a date before today (Caracas)', async () => {
      // 2026-06-07 is yesterday relative to FIXED_TODAY (which is 08:00 Caracas on 2026-06-08)
      const result = await useCase.execute(DOCTOR_ID, '2026-06-07');

      expect(result.slots).toHaveLength(0);
    });

    it('returns slots for today in Caracas (inclusive)', async () => {
      // DATE_STR = 2026-06-08 = today in Caracas
      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots.length).toBeGreaterThan(0);
    });

    it('returns slots within the horizon window', async () => {
      // Within 8 weeks from 2026-06-08 → 2026-07-20 is week 6
      await useCase.execute(DOCTOR_ID, '2026-07-20');

      // We have a Monday office (day=0); 2026-07-20 is a Monday
      // The horizon check should pass (not return early).
      // Key: it should NOT throw and blockRepo.findOverlapping is called.
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

  // ─── Lead-time enforcement (bookingMinLeadDays) ───────────────────────────

  describe('lead-time enforcement (bookingMinLeadDays)', () => {
    // FIXED_TODAY = 2026-06-08 (Monday).
    // All tests in this group use fake timers inherited from the outer beforeAll.

    it('returns empty slots when date falls within the minimum lead-time window', async () => {
      // minLeadDays=8 → earliest bookable = 2026-06-08 + 8 = 2026-06-16.
      // 2026-06-15 (Monday, 7 days ahead) is inside the window → must be empty.
      scheduleRepo = makeScheduleRepo(8, 8);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, '2026-06-15');

      expect(result.slots).toHaveLength(0);
    });

    it('returns slots when date is beyond the minimum lead-time window', async () => {
      // minLeadDays=3 → earliest bookable = 2026-06-08 + 3 = 2026-06-11.
      // 2026-06-15 (Monday, 7 days ahead) is beyond that → office has Monday slots.
      scheduleRepo = makeScheduleRepo(8, 3);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, '2026-06-15');

      expect(result.slots.length).toBeGreaterThan(0);
    });

    it('returns slots normally for today when minLeadDays is 0 (no restriction)', async () => {
      // DATE_STR = 2026-06-08 (today); minLeadDays=0 → same lower bound as before.
      scheduleRepo = makeScheduleRepo(8, 0);
      useCase = makeUseCase(doctorLoader, officeRepo, appointmentRepo, blockRepo, scheduleRepo);

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots.length).toBeGreaterThan(0);
    });
  });

  // ─── Query behaviour ──────────────────────────────────────────────────────

  describe('query behaviour', () => {
    it('queries appointments for the correct doctor using Caracas day boundaries', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      // dayStart = 2026-06-08T00:00:00-04:00 = 2026-06-08T04:00:00Z
      // dayEnd   = 2026-06-08T23:59:59.999-04:00 = 2026-06-09T03:59:59.999Z
      expect(appointmentRepo.findActiveByDoctorAndDateRange).toHaveBeenCalledWith(
        DOCTOR_ID,
        DAY_START_CARACAS,
        DAY_END_CARACAS,
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

    it('queries blocks using Caracas day boundaries', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(blockRepo.findOverlapping).toHaveBeenCalledWith(
        DOCTOR_ID,
        DAY_START_CARACAS,
        DAY_END_CARACAS,
      );
    });
  });
});
