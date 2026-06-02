import { CreateBookingUseCase, DoctorNotFoundError } from './create-booking.use-case';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';
import { ConsumePackageSessionUseCase } from '../../../../packages/application/use-cases/packages/consume-package-session.use-case';
import { Appointment } from '../../../../appointments/domain/entities/appointment.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { PatientPackage } from '../../../../packages/domain/entities/patient-package.entity';
import type { IAppointmentRepository } from '../../../../appointments/domain/repositories/appointment.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { AppointmentConflictError } from '../../../../appointments/domain/errors/appointment-conflict.error';
import { PackageExhaustedError } from '../../../../packages/domain/errors/package-exhausted.error';

const DOCTOR: DoctorPublicInfo = {
  id: 'doc-001',
  fullName: 'Dr. González',
  specialty: 'Cardiología',
  professionalTitle: 'Dr.',
  paymentMethods: ['pago_movil'],
  allowsOnline: false,
  officeAddress: 'Av. Principal',
  city: 'Caracas',
  avatarUrl: null,
  isActive: true,
};

const makeDto = (overrides: Record<string, unknown> = {}) => ({
  cf_turnstile_token: 'stub-token',
  doctor_id: 'doc-001',
  patient_name: 'María López',
  patient_email: 'maria@example.com',
  patient_cedula: 'V-12345678',
  patient_phone: '+584121234567',
  scheduled_at: '2026-07-01T10:00:00Z',
  appointment_mode: 'presencial' as const,
  plan_name: 'Consulta General',
  plan_price: 30,
  payment_method: 'pago_movil',
  ...overrides,
});

const makePatient = () =>
  Patient.create({
    id: 'pat-001',
    doctorId: 'doc-001',
    fullName: 'María López',
    email: 'maria@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeAppointment = () =>
  Appointment.create({
    id: 'appt-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    patientName: 'María López',
    patientEmail: 'maria@example.com',
    scheduledAt: new Date('2026-07-01T10:00:00Z'),
    status: 'scheduled',
    appointmentMode: 'presencial',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makePkg = (overrides: Partial<ConstructorParameters<typeof PatientPackage>[0]> = {}) =>
  PatientPackage.create({
    id: 'pkg-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete 10',
    totalSessions: 10,
    usedSessions: 5,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

/** Fake Sequelize that executes the callback immediately with a mock transaction handle. */
const FAKE_TRANSACTION = { id: 'tx-mock' };
const mockSequelize = {
  transaction: jest
    .fn()
    .mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(FAKE_TRANSACTION)),
};

describe('CreateBookingUseCase', () => {
  let useCase: CreateBookingUseCase;
  let mockAppointmentRepo: jest.Mocked<IAppointmentRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;
  let mockDoctorLoader: jest.Mocked<IBookingDoctorLoader>;
  let mockConsumeUseCase: jest.Mocked<ConsumePackageSessionUseCase>;
  let mockCrypto: { hashForSearch: jest.Mock; encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAppointmentRepo = {
      findById: jest.fn(),
      list: jest.fn(),
      save: jest.fn(),
      updateStatus: jest.fn(),
      hasSlotConflict: jest.fn(),
      hasDuplicate: jest.fn(),
      findPackageById: jest.fn(),
      incrementPackageSessions: jest.fn(),
      logStatusChange: jest.fn(),
    };

    mockPatientRepo = {
      findById: jest.fn(),
      findByCedulaHash: jest.fn(),
      findByEmailHash: jest.fn(),
      list: jest.fn(),
      findAllByDoctor: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      logReveal: jest.fn(),
    };

    mockDoctorLoader = { findById: jest.fn() };

    mockConsumeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ConsumePackageSessionUseCase>;

    mockCrypto = {
      hashForSearch: jest.fn().mockReturnValue('hash-abc'),
      encrypt: jest.fn().mockReturnValue('encrypted'),
      decrypt: jest.fn().mockReturnValue('decrypted'),
    };

    useCase = new CreateBookingUseCase(
      mockAppointmentRepo,
      mockPatientRepo,
      mockDoctorLoader,
      mockConsumeUseCase,
      mockCrypto as unknown as import('../../../../../infrastructure/crypto/crypto.service').CryptoService,
      mockSequelize as unknown as import('sequelize-typescript').Sequelize,
    );
  });

  describe('creates appointment for available slot', () => {
    it('creates appointment and new patient with manual payment', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      const result = await useCase.execute(makeDto());

      expect(result.appointment).toBeDefined();
      expect(result.appointmentCode).toMatch(/^BK-/);
      expect(mockPatientRepo.save).toHaveBeenCalled();
      expect(mockAppointmentRepo.save).toHaveBeenCalled();
      // Wraps steps 5+6 in a transaction
      expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    });

    it('reuses existing patient found by email hash', async () => {
      const existingPatient = makePatient();
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(existingPatient);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('creates appointment using package session', () => {
    it('calls consumePackageSession with the transaction handle when packageId is provided', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(makePatient());
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());
      mockConsumeUseCase.execute.mockResolvedValue(makePkg({ usedSessions: 6 }));

      await useCase.execute(makeDto({ package_id: 'pkg-001' }));

      expect(mockConsumeUseCase.execute).toHaveBeenCalledWith({
        packageId: 'pkg-001',
        doctorId: 'doc-001',
        transaction: FAKE_TRANSACTION,
      });
    });

    it('sets payment_method to "package" when using a package', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(makePatient());
      mockAppointmentRepo.save.mockImplementation(async (a) => a);
      mockConsumeUseCase.execute.mockResolvedValue(makePkg());

      await useCase.execute(makeDto({ package_id: 'pkg-001' }));

      expect(mockAppointmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'package' }),
        FAKE_TRANSACTION,
      );
    });
  });

  describe('rejects occupied slot', () => {
    it('throws AppointmentConflictError when slot is already taken', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(true);

      await expect(useCase.execute(makeDto())).rejects.toThrow(AppointmentConflictError);
      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('rejects inactive doctor', () => {
    it('throws DoctorNotFoundError when doctor is inactive', async () => {
      mockDoctorLoader.findById.mockResolvedValue({ ...DOCTOR, isActive: false });

      await expect(useCase.execute(makeDto())).rejects.toThrow(DoctorNotFoundError);
    });

    it('throws DoctorNotFoundError when doctor does not exist', async () => {
      mockDoctorLoader.findById.mockResolvedValue(null);

      await expect(useCase.execute(makeDto())).rejects.toThrow(DoctorNotFoundError);
    });
  });

  describe('transaction rollback if package consumption fails', () => {
    it('propagates error from consumePackageSession so the transaction rolls back', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(makePatient());
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());
      mockConsumeUseCase.execute.mockRejectedValue(new PackageExhaustedError('pkg-001'));

      // The transaction wrapper re-throws, which triggers Sequelize rollback.
      await expect(useCase.execute(makeDto({ package_id: 'pkg-001' }))).rejects.toThrow(
        PackageExhaustedError,
      );
    });
  });

  describe('Turnstile stub', () => {
    it('accepts any token in Etapa 1 without throwing', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(makePatient());
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await expect(
        useCase.execute(makeDto({ cf_turnstile_token: 'any-token' })),
      ).resolves.toBeDefined();
    });
  });
});
