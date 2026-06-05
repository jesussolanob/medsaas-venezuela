import { GetAvailableSlotsUseCase } from './get-available-slots.use-case';
import { DoctorNotFoundError } from './create-booking.use-case';
import type { IBookingDoctorLoader } from '../../../domain/repositories/booking-doctor.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import type { IAppointmentRepository } from '../../../../appointments/domain/repositories/appointment.repository';
import { Office } from '../../../../offices/domain/entities/office.entity';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../../appointments/domain/entities/appointment.entity';

const DOCTOR_ID = 'doctor-uuid-1';
// 2026-06-08 is a Monday (getUTCDay()=1 → officeDay=(1+6)%7=0)
const DATE_STR = '2026-06-08';
const now = new Date('2026-06-08T00:00:00.000Z');

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOffice(overrides: Partial<Parameters<typeof Office.create>[0]> = {}): Office {
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
  } as jest.Mocked<IAppointmentRepository>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GetAvailableSlotsUseCase (offices-based)', () => {
  let useCase: GetAvailableSlotsUseCase;
  let doctorLoader: jest.Mocked<IBookingDoctorLoader>;
  let officeRepo: jest.Mocked<IOfficeRepository>;
  let appointmentRepo: jest.Mocked<IAppointmentRepository>;

  beforeEach(() => {
    doctorLoader = makeDoctorLoader();
    officeRepo = makeOfficeRepo([makeOffice()]);
    appointmentRepo = makeAppointmentRepo();
    useCase = new GetAvailableSlotsUseCase(
      doctorLoader as unknown as IBookingDoctorLoader,
      officeRepo,
      appointmentRepo,
    );
  });

  // ─── Anti-enumeration ─────────────────────────────────────────────────────

  describe('anti-enumeration', () => {
    it('throws DoctorNotFoundError when doctor does not exist', async () => {
      doctorLoader.findById.mockResolvedValue(null);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      await expect(useCase.execute(DOCTOR_ID, DATE_STR)).rejects.toBeInstanceOf(
        DoctorNotFoundError,
      );
    });

    it('throws DoctorNotFoundError when doctor is inactive', async () => {
      doctorLoader.findById.mockResolvedValue({ id: DOCTOR_ID, isActive: false } as never);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

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
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots).toHaveLength(0);
    });

    it('returns empty slots when no office has Monday enabled', async () => {
      // Office only has Tuesday (day=1) enabled
      const tuesdayOffice = makeOffice({
        schedule: [{ day: 1, enabled: true, start: '08:00', end: '12:00' }],
      });
      officeRepo = makeOfficeRepo([tuesdayOffice]);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      // DATE_STR is Monday (officeDay=0) — no office has Monday
      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(result.slots).toHaveLength(0);
    });

    it('deduplicates slots from multiple offices with overlapping times', async () => {
      const office1 = makeOffice({ id: 'off-1', schedule: [{ day: 0, enabled: true, start: '08:00', end: '10:00' }] });
      const office2 = makeOffice({ id: 'off-2', schedule: [{ day: 0, enabled: true, start: '08:00', end: '10:00' }] });
      officeRepo = makeOfficeRepo([office1, office2]);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // Without dedup would be 8 slots (4+4), with dedup → 4
      const times = result.slots.map((s) => s.time);
      expect(new Set(times).size).toBe(times.length);
    });

    it('applies buffer_minutes to advance next slot start', async () => {
      // slot_duration=30, buffer_minutes=10 → step=40min
      const office = makeOffice({
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '12:00' }],
        slotDuration: 30,
        bufferMinutes: 10,
      });
      officeRepo = makeOfficeRepo([office]);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      // Steps: 08:00, 08:40, 09:20, 10:00, 10:40, 11:20
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
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      const result = await useCase.execute(DOCTOR_ID, DATE_STR);

      const times = result.slots.map((s) => s.time);
      const sorted = [...times].sort();
      expect(times).toEqual(sorted);
    });
  });

  // ─── Weekday mapping ──────────────────────────────────────────────────────

  describe('weekday mapping (JS 0=Sun → offices 0=Mon)', () => {
    it('maps Sunday correctly: JS getUTCDay()=0 → officeDay=6', async () => {
      // 2026-06-07 is a Sunday
      const sundayOffice = makeOffice({
        schedule: [{ day: 6, enabled: true, start: '09:00', end: '11:00' }], // Sunday = day 6
      });
      officeRepo = makeOfficeRepo([sundayOffice]);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      const result = await useCase.execute(DOCTOR_ID, '2026-06-07');

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0]!.time).toBe('09:00');
    });

    it('returns empty for Sunday when only Monday (day=0) is enabled', async () => {
      // Default office has day=0 (Monday) only
      officeRepo = makeOfficeRepo([makeOffice()]);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      // 2026-06-07 is Sunday (officeDay=6), but office has day=0 (Monday)
      const result = await useCase.execute(DOCTOR_ID, '2026-06-07');

      expect(result.slots).toHaveLength(0);
    });

    it('maps Saturday correctly: JS getUTCDay()=6 → officeDay=5', async () => {
      // 2026-06-13 is a Saturday
      const saturdayOffice = makeOffice({
        schedule: [{ day: 5, enabled: true, start: '08:00', end: '10:00' }], // Saturday = day 5
      });
      officeRepo = makeOfficeRepo([saturdayOffice]);
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

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
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

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
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

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
      officeRepo = makeOfficeRepo([]); // no offices
      useCase = new GetAvailableSlotsUseCase(
        doctorLoader as unknown as IBookingDoctorLoader,
        officeRepo,
        appointmentRepo,
      );

      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(appointmentRepo.findActiveByDoctorAndDateRange).not.toHaveBeenCalled();
    });

    it('calls findActiveByDoctor with the correct doctorId', async () => {
      await useCase.execute(DOCTOR_ID, DATE_STR);

      expect(officeRepo.findActiveByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });
});
