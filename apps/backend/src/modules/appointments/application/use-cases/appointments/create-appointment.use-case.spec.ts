import { CreateAppointmentUseCase } from './create-appointment.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import { InsufficientSessionsError } from '../../../domain/errors/insufficient-sessions.error';
import type { CreateAppointmentDto } from '@delta/shared-types';
import type { Appointment } from '../../../domain/entities/appointment.entity';

const baseDto: CreateAppointmentDto = {
  doctor_id: 'doctor-uuid-1',
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

function makeRepo(
  overrides: Partial<IAppointmentRepository> = {},
): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    list: jest.fn(),
    save: jest.fn().mockImplementation((appt: Appointment) => Promise.resolve(appt)),
    updateStatus: jest.fn(),
    hasSlotConflict: jest.fn().mockResolvedValue(false),
    hasDuplicate: jest.fn().mockResolvedValue(false),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
}

describe('CreateAppointmentUseCase', () => {
  let useCase: CreateAppointmentUseCase;
  let repo: jest.Mocked<IAppointmentRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new CreateAppointmentUseCase(repo);
  });

  it('creates appointment for an available slot', async () => {
    const result = await useCase.execute(baseDto);

    expect(repo.hasSlotConflict).toHaveBeenCalledWith({
      doctorId: 'doctor-uuid-1',
      scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    expect(repo.hasDuplicate).toHaveBeenCalledWith({
      patientId: 'patient-uuid-1',
      scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('scheduled');
    expect(result.doctorId).toBe('doctor-uuid-1');
  });

  it('throws AppointmentConflictError when the slot is already occupied', async () => {
    repo = makeRepo({ hasSlotConflict: jest.fn().mockResolvedValue(true) });
    useCase = new CreateAppointmentUseCase(repo);

    await expect(useCase.execute(baseDto)).rejects.toBeInstanceOf(AppointmentConflictError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws AppointmentDuplicateError when same patient has appointment ±15 min', async () => {
    repo = makeRepo({ hasDuplicate: jest.fn().mockResolvedValue(true) });
    useCase = new CreateAppointmentUseCase(repo);

    await expect(useCase.execute(baseDto)).rejects.toBeInstanceOf(AppointmentDuplicateError);
    expect(repo.hasSlotConflict).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('skips duplicate check when patient_id is absent (anonymous booking)', async () => {
    const dto = { ...baseDto, patient_id: undefined };
    await useCase.execute(dto);

    expect(repo.hasDuplicate).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('throws InsufficientSessionsError when package has no remaining sessions', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: 'doctor-uuid-1',
      usedSessions: 5,
      totalSessions: 5,
      status: 'active',
    };
    repo = makeRepo({ findPackageById: jest.fn().mockResolvedValue(pkg) });
    useCase = new CreateAppointmentUseCase(repo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
    expect(repo.incrementPackageSessions).not.toHaveBeenCalled();
  });

  it('throws InsufficientSessionsError when package belongs to a different doctor', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: 'other-doctor',
      usedSessions: 0,
      totalSessions: 5,
      status: 'active',
    };
    repo = makeRepo({ findPackageById: jest.fn().mockResolvedValue(pkg) });
    useCase = new CreateAppointmentUseCase(repo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
  });

  it('throws InsufficientSessionsError when package status is not active', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: 'doctor-uuid-1',
      usedSessions: 3,
      totalSessions: 5,
      status: 'completed',
    };
    repo = makeRepo({ findPackageById: jest.fn().mockResolvedValue(pkg) });
    useCase = new CreateAppointmentUseCase(repo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
  });

  it('throws InsufficientSessionsError when optimistic lock fails (concurrent session consumption)', async () => {
    // When two concurrent requests read the same used_sessions value and one wins the
    // UPDATE WHERE used_sessions = :current, the other gets rowsAffected = 0.
    // The correct error is InsufficientSessionsError (package exhausted concurrently),
    // NOT AppointmentConflictError (which means "slot taken by another appointment").
    const pkg = {
      id: 'pkg-1',
      doctorId: 'doctor-uuid-1',
      usedSessions: 2,
      totalSessions: 5,
      status: 'active',
    };
    repo = makeRepo({
      findPackageById: jest.fn().mockResolvedValue(pkg),
      incrementPackageSessions: jest.fn().mockResolvedValue(false),
    });
    useCase = new CreateAppointmentUseCase(repo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientSessionsError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('increments package sessions when lock succeeds and saves the appointment', async () => {
    const pkg = {
      id: 'pkg-1',
      doctorId: 'doctor-uuid-1',
      usedSessions: 2,
      totalSessions: 5,
      status: 'active',
    };
    repo = makeRepo({
      findPackageById: jest.fn().mockResolvedValue(pkg),
      incrementPackageSessions: jest.fn().mockResolvedValue(true),
    });
    useCase = new CreateAppointmentUseCase(repo);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    const result = await useCase.execute(dto);

    expect(repo.incrementPackageSessions).toHaveBeenCalledWith('pkg-1', 2);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(result.packageId).toBe('pkg-1');
  });
});
