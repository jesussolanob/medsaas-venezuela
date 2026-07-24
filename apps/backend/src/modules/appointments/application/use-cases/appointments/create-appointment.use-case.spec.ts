import { CreateAppointmentUseCase } from './create-appointment.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import { InsufficientSessionsError } from '../../../domain/errors/insufficient-sessions.error';
import { AppointmentOfficeInvalidError } from '../../../domain/errors/appointment-office-invalid.error';
import type { CreateAppointmentDto } from '@delta/shared-types';
import type { Appointment } from '../../../domain/entities/appointment.entity';
import { Appointment as AppointmentClass } from '../../../domain/entities/appointment.entity';
import { Office } from '../../../../offices/domain/entities/office.entity';
import type { CreateConsultationUseCase } from '../../../../consultations/application/use-cases/consultations/create-consultation.use-case';

const DOCTOR_ID = 'doctor-uuid-1';
const PATIENT_ID = 'patient-uuid-1';
const OFFICE_ID = 'office-uuid-1111-2222-3333-444444444444';
const CONSULTATION_ID = 'cons-uuid-1111-2222-3333-444444444444';

const baseDto: CreateAppointmentDto = {
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  patient_name: 'Juan P.',
  patient_phone: null,
  patient_email: null,
  patient_cedula: null,
  scheduled_at: '2026-06-10T10:00:00.000Z',
  appointment_mode: 'presencial',
  plan_name: 'Consulta General',
  plan_price: 30,
};

function makeOffice(
  modality: 'in_person' | 'online' | 'both' = 'in_person',
  slotDuration = 30,
): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId: DOCTOR_ID,
    name: 'Consultorio',
    address: '',
    city: 'Caracas',
    phone: '',
    schedule: [],
    slotDuration,
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
    hasOverlap: jest.fn().mockResolvedValue(false),
    hasPatientOverlap: jest.fn().mockResolvedValue(false),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    findByIdForDoctor: jest.fn(),
    updateMeetLink: jest.fn(),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest.fn().mockImplementation((id: string) =>
      Promise.resolve(
        AppointmentClass.create({
          id,
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          authUserId: null,
          consultationId: CONSULTATION_ID,
          patientName: 'Juan P.',
          patientPhone: null,
          patientEmail: null,
          patientCedula: null,
          scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
          status: 'confirmed',
          appointmentMode: 'presencial',
          source: null,
          planName: 'Consulta General',
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
          durationMinutes: 30,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    ),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
}

function makeCreateConsultationUC(): jest.Mocked<CreateConsultationUseCase> {
  return {
    execute: jest.fn().mockResolvedValue({ id: CONSULTATION_ID }),
  } as unknown as jest.Mocked<CreateConsultationUseCase>;
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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);
  });

  // -----------------------------------------------------------------
  // Core creation tests (no office)
  // -----------------------------------------------------------------

  it('creates appointment for an available slot (no office)', async () => {
    // No actorRole passed → defaults to 'scheduled' (public/patient path)
    const result = await useCase.execute(baseDto);

    expect(appointmentRepo.hasOverlap).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
      durationMinutes: 30,
    });
    expect(appointmentRepo.hasPatientOverlap).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      scheduledAt: new Date('2026-06-10T10:00:00.000Z'),
      durationMinutes: 30,
    });
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('scheduled');
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.officeId).toBeNull();
    expect(result.durationMinutes).toBe(30);
    expect(officeRepo.findById).not.toHaveBeenCalled();
  });

  it('persists the computed durationMinutes on the saved appointment', async () => {
    const office = makeOffice('in_person', 45);
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    const dto: CreateAppointmentDto = {
      ...baseDto,
      office_id: OFFICE_ID,
      appointment_mode: 'presencial',
    };
    const result = await useCase.execute(dto);

    expect(result.durationMinutes).toBe(45);
    expect(appointmentRepo.hasOverlap).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 45 }),
    );
    expect(appointmentRepo.hasPatientOverlap).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 45 }),
    );
  });

  it('throws AppointmentConflictError when the slot overlaps an existing appointment', async () => {
    appointmentRepo = makeAppointmentRepo({ hasOverlap: jest.fn().mockResolvedValue(true) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    await expect(useCase.execute(baseDto)).rejects.toBeInstanceOf(AppointmentConflictError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('throws AppointmentDuplicateError when same patient has overlapping appointment', async () => {
    appointmentRepo = makeAppointmentRepo({
      hasPatientOverlap: jest.fn().mockResolvedValue(true),
    });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    await expect(useCase.execute(baseDto)).rejects.toBeInstanceOf(AppointmentDuplicateError);
    expect(appointmentRepo.hasOverlap).not.toHaveBeenCalled();
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('skips patient overlap check when patient_id is absent (anonymous booking)', async () => {
    const dto = { ...baseDto, patient_id: undefined };
    await useCase.execute(dto);

    expect(appointmentRepo.hasPatientOverlap).not.toHaveBeenCalled();
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------
  // Adjacent slots — no overlap
  // -----------------------------------------------------------------

  it('does NOT conflict for adjacent slots (15:00-15:30 and 15:30-16:00)', async () => {
    // hasOverlap returns false for adjacent slots (correct overlap detection)
    appointmentRepo = makeAppointmentRepo({ hasOverlap: jest.fn().mockResolvedValue(false) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    const dto = {
      ...baseDto,
      scheduled_at: '2026-06-10T15:30:00.000Z',
    };
    const result = await useCase.execute(dto);

    expect(result.status).toBe('scheduled');
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  it('conflicts for partial overlap (15:00-15:30 vs 15:10+)', async () => {
    appointmentRepo = makeAppointmentRepo({ hasOverlap: jest.fn().mockResolvedValue(true) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    const dto = {
      ...baseDto,
      scheduled_at: '2026-06-10T15:10:00.000Z',
    };
    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentConflictError);
  });

  // -----------------------------------------------------------------
  // Office validation tests
  // -----------------------------------------------------------------

  it('persists officeId when provided and office is owned by doctor', async () => {
    const office = makeOffice('in_person');
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    const dto: CreateAppointmentDto = { ...baseDto, office_id: OFFICE_ID };

    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentOfficeInvalidError);
    expect(appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('throws AppointmentOfficeInvalidError (modality_mismatch) for online mode in in_person office', async () => {
    const office = makeOffice('in_person');
    officeRepo = makeOfficeRepo({ findById: jest.fn().mockResolvedValue(office) });
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

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
    useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

    const dto = { ...baseDto, package_id: 'pkg-1' };
    const result = await useCase.execute(dto);

    expect(appointmentRepo.incrementPackageSessions).toHaveBeenCalledWith('pkg-1', 2);
    expect(appointmentRepo.save).toHaveBeenCalledTimes(1);
    expect(result.packageId).toBe('pkg-1');
  });

  // -----------------------------------------------------------------
  // Auto-confirm rule (Bug 5)
  // -----------------------------------------------------------------

  describe('auto-confirm status rule', () => {
    /** Scheduled date within 1 day (triggers auto-confirm for doctors). */
    const nearFutureDto: CreateAppointmentDto = {
      ...baseDto,
      // 1 hour from now — always < 3 days
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    /** Scheduled date 5 days from now (no auto-confirm). */
    const farFutureDto: CreateAppointmentDto = {
      ...baseDto,
      scheduled_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    };

    it('doctor creates appointment within 3 days → status confirmed', async () => {
      const result = await useCase.execute(nearFutureDto, 'doctor');
      expect(result.status).toBe('confirmed');
    });

    it('admin creates appointment within 3 days → status confirmed', async () => {
      const result = await useCase.execute(nearFutureDto, 'admin');
      expect(result.status).toBe('confirmed');
    });

    it('doctor creates appointment 5 days out → status scheduled', async () => {
      const result = await useCase.execute(farFutureDto, 'doctor');
      expect(result.status).toBe('scheduled');
    });

    it('patient (no actorRole) creates appointment within 3 days → status scheduled', async () => {
      const result = await useCase.execute(nearFutureDto);
      expect(result.status).toBe('scheduled');
    });

    it('unknown actorRole → status scheduled regardless of date', async () => {
      const result = await useCase.execute(nearFutureDto, 'patient');
      expect(result.status).toBe('scheduled');
    });
  });

  // -----------------------------------------------------------------
  // Auto-consultation creation on auto-confirm (Bug 5)
  // -----------------------------------------------------------------

  describe('auto-consultation creation on auto-confirm', () => {
    const nearFutureDto: CreateAppointmentDto = {
      ...baseDto,
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    it('creates consultation and links consultationId when auto-confirmed with patientId', async () => {
      const createConsultationUC = makeCreateConsultationUC();
      useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, createConsultationUC);

      const result = await useCase.execute(nearFutureDto, 'doctor');

      expect(result.status).toBe('confirmed');
      expect(createConsultationUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
        }),
      );
      expect(appointmentRepo.updateConsultationId).toHaveBeenCalledWith(result.id, CONSULTATION_ID);
      expect(result.consultationId).toBe(CONSULTATION_ID);
    });

    it('does NOT create consultation when no patientId (anonymous)', async () => {
      const createConsultationUC = makeCreateConsultationUC();
      useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, createConsultationUC);

      const dto: CreateAppointmentDto = {
        ...nearFutureDto,
        patient_id: undefined,
        patient_cedula: 'V-12345678',
      };
      await useCase.execute(dto, 'doctor');

      expect(createConsultationUC.execute).not.toHaveBeenCalled();
      expect(appointmentRepo.updateConsultationId).not.toHaveBeenCalled();
    });

    it('does NOT create consultation when createConsultationUC is not injected', async () => {
      useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, null);

      const result = await useCase.execute(nearFutureDto, 'doctor');

      expect(result.status).toBe('confirmed');
      expect(appointmentRepo.updateConsultationId).not.toHaveBeenCalled();
    });

    it('returns saved appointment (non-fatal) when consultation creation fails', async () => {
      const createConsultationUC = makeCreateConsultationUC();
      createConsultationUC.execute.mockRejectedValue(new Error('code exhausted'));
      useCase = new CreateAppointmentUseCase(appointmentRepo, officeRepo, createConsultationUC);

      const result = await useCase.execute(nearFutureDto, 'doctor');

      expect(result.status).toBe('confirmed');
      expect(appointmentRepo.updateConsultationId).not.toHaveBeenCalled();
    });
  });
});
