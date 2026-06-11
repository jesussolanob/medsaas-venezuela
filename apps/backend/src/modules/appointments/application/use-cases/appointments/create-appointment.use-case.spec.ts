import { CreateAppointmentUseCase } from './create-appointment.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import { InsufficientSessionsError } from '../../../domain/errors/insufficient-sessions.error';
import { AppointmentOfficeInvalidError } from '../../../domain/errors/appointment-office-invalid.error';
import type { CreateAppointmentDto } from '@delta/shared-types';
import type { Appointment } from '../../../domain/entities/appointment.entity';
import { Office } from '../../../../offices/domain/entities/office.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const OFFICE_ID = 'office-uuid-1111-2222-3333-444444444444';

const baseDto: CreateAppointmentDto = {
  doctor_id: DOCTOR_ID,
  patient_id: 'patient-uuid-1',
  patient_name: 'Juan P.',
  patient_phone: null,
  patient_email: null,
  patient_cedula: null,
  scheduled_at: '2026-06-10T10:00:00.000Z',
  appointment_mode: 'presencial',
  plan_name: 'Consulta General',
  plan_price: 30,
};

function makeOffice(modality: 'in_person' | 'online' | 'both' = 'in_person'): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId: DOCTOR_ID,
    name: 'Consultorio',
    address: '',
    city: 'Caracas',
    phone: '',
    schedule: [],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentRepo(
  overrides: Partial<IAppointmentRepository> = {},
): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    list: jest.fn(),
    save: jest.fn().mockImplementation((appt: Appointment) => Promise.resolve(appt)),
    updateStatus: jest.fn(),
    updateScheduledAt: jest.fn(),
    hasSlotConflict: jest.fn().mockResolvedValue(false),
    hasDuplicate: jest.fn().mockResolvedValue(false),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    findRescheduleChain: jest.fn(),
    findChangeLogs: jest.fn(),
    findByIdForDoctor: jest.fn(),
    updateMeetLink: jest.fn(),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
}

function makeOfficeRepo(
  overrides: Partial<IOfficeRepository> = {},
): jest.Mocked<IOfficeRepository> {
  return {
    listByDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    findActiveByDoctor: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as jest.Mocked<IOfficeRepository>;
}

describe('CreateAppointmentUseCase', () => {
  let useCase: CreateAppointmentUseCase;
  let appointmentRepo: jest.Mocked<IAppointmentRepository>;
  let officeRepo: jest.Mocked<IOfficeRepository>;

  beforeEach(() => {
    appointmentRepo = makeAppointmentRepo();
    officeRepo = makeOfficeRepo();
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);
  });

  // -----------------------------------------------------------------
  // Core creation tests (no office)
  // -----------------------------------------------------------------

  it('creates appointment for an available slot (no office)', async () => {
    const result = await useCase.execute(baseDto);

    expect(appointmentRepo.hasSlotConflict).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    expect(appointmentRepo.hasDuplicate).toHaveBeenCalledWith({
      patientId: 'patient-uuid-1',
      scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('scheduled');
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.officeId).toBeNull();
    expect(officeRepo.findById).not.toHaveBeenCalled();
  });

  it('throws AppointmentConflictError when the slot is already occupied', async () => {
    appointmentRepo = makeAppointmentRepo({ hasSlotConflict: jest.fn().mockResolvedValue(true) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    await expect(useCase.execute(baseDto)).rejects.toBeInstanceOf(AppointmentConflictError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('throws AppointmentDuplicateError when same patient has appointment ±15 min', async () => {
    appointmentRepo = makeAppointmentRepo({ hasDuplicate: jest.fn().mockResolvedValue(true) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    await expect(useCase.execute(baseDto)).rejects.toBeInstanceOf(AppointmentDuplicateError);
    expect(appointmentRepo.hasSlotConflict).not.toHaveBeenCalled();
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('skips duplicate check when patient_id is absent (anonymous booking)', async () => {
    const dto = { ...baseDto, patient_id: undefined };
    await useCase.execute(dto);

    expect(appointmentRepo.hasDuplicate).not.toHaveBeenCalled();
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------
  // Office validation tests
  // -----------------------------------------------------------------

  it('persists officeId when provided and office is owned by doctor', async () => {
    const office = makeOffice('in_person');
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto: CreateAppointmentDto = {
      ...baseDto,
      office_id: OFFICE_ID,
      appointment_mode: 'presencial',
    };
    const result = await useCase.execute(dto);

    expect(officeRepo.findById).toHaveBeenCalledWith(OFFICE_ID);
    expect(result.officeId).toBe(OFFICE_ID);
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  it('throws AppointmentOfficeInvalidError (not_owned) when office not found', async () => {
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(null) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto: CreateAppointmentDto = { ...baseDto, office_id: OFFICE_ID };

    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentOfficeInvalidError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('throws AppointmentOfficeInvalidError (not_owned) when office belongs to another doctor', async () => {
    const officeOtherDoctor = Office.create({
      id: OFFICE_ID,
      doctorId: 'other-doctor-id',
      name: 'Other',
      address: '',
      city: '',
      phone: '',
      schedule: [],
      slotDuration: 30,
      bufferMinutes: 10,
      isActive: true,
      modality: 'in_person',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(officeOtherDoctor) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto: CreateAppointmentDto = { ...baseDto, office_id: OFFICE_ID };

    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentOfficeInvalidError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('throws AppointmentOfficeInvalidError (modality_mismatch) for online mode in in_person office', async () => {
    const office = makeOffice('in_person');
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto: CreateAppointmentDto = {
      ...baseDto,
      office_id: OFFICE_ID,
      appointment_mode: 'online',
    };

    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentOfficeInvalidError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('allows presencial mode for both modality office', async () => {
    const office = makeOffice('both');
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto: CreateAppointmentDto = {
      ...baseDto,
      office_id: OFFICE_ID,
      appointment_mode: 'presencial',
    };
    const result = await useCase.execute(dto);

    expect(result.officeId).toBe(OFFICE_ID);
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  it('allows online mode for online modality office', async () => {
    const office = makeOffice('online');
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto: CreateAppointmentDto = {
      ...baseDto,
      office_id: OFFICE_ID,
      appointment_mode: 'online',
    };
    const result = await useCase.execute(dto);

    expect(result.officeId).toBe(OFFICE_ID);
  });

  // -----------------------------------------------------------------
  // Package session tests
  // -----------------------------------------------------------------

  it('throws InsufficientSessionsError when package has no remaining sessions', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: DOCTOR_ID,
      usedSessions: 5,
      totalSessions: 5,
      status: 'active',
    };
    appointmentRepo = makeAppointmentRepo({ findPackageById: jest.fn().mockResolvedValue(pkg) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
    expect(appointmentRepo.incrementPackageSessions).not.toHaveBeenCalled();
  });

  it('throws InsufficientSessionsError when package belongs to a different doctor', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: 'other-doctor',
      usedSessions: 0,
      totalSessions: 5,
      status: 'active',
    };
    appointmentRepo = makeAppointmentRepo({ findPackageById: jest.fn().mockResolvedValue(pkg) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
  });

  it('throws InsufficientSessionsError when optimistic lock fails', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: DOCTOR_ID,
      usedSessions: 2,
      totalSessions: 5,
      status: 'active',
    };
    appointmentRepo = makeAppointmentRepo({
      findPackageById: jest.fn().mockResolvedValue(pkg),
      incrementPackageSessions: jest.fn().mockResolvedValue(false),
    });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('increments package sessions when lock succeeds and saves the appointment', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: DOCTOR_ID,
      usedSessions: 2,
      totalSessions: 5,
      status: 'active',
    };
    appointmentRepo = makeAppointmentRepo({
      findPackageById: jest.fn().mockResolvedValue(pkg),
      incrementPackageSessions: jest.fn().mockResolvedValue(true),
    });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    const result = await useCase.execute(dto);

    expect(appointmentRepo.incrementPackageSessions).toHaveBeenCalledWith('pkg-1', 2);
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
    expect(result.packageId).toBe('pkg-1');
  });
});
