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
import type { ResolvePatientIdentityUseCase } from '../../../../patient-identities/application/use-cases/resolve-patient-identity.use-case';

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
  let mockResolveIdentity: jest.Mocked<ResolvePatientIdentityUseCase>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAppointmentRepo = {
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
      findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
      findByIdForDoctor: jest.fn(),
      findRescheduleChain: jest.fn().mockResolvedValue([]),
      findChangeLogs: jest.fn().mockResolvedValue([]),
      updateMeetLink: jest.fn().mockResolvedValue(undefined),
      updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
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

    mockResolveIdentity = {
      execute: jest.fn().mockResolvedValue('identity-uuid-booking'),
    } as never;

    useCase = new CreateBookingUseCase(
      mockAppointmentRepo,
      mockPatientRepo,
      mockDoctorLoader,
      mockConsumeUseCase,
      mockCrypto as unknown as import('../../../../../infrastructure/crypto/crypto.service').CryptoService,
      mockSequelize as unknown as import('sequelize-typescript').Sequelize,
      null, // paymentRepo — optional
      mockResolveIdentity,
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

  describe('identity resolution on new patient creation', () => {
    it('calls resolveIdentity with the cedula when creating a new patient', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      expect(mockResolveIdentity.execute).toHaveBeenCalledWith('V-12345678');
    });

    it('sets identityId on the new patient entity', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      const savedPatient = mockPatientRepo.save.mock.calls[0]?.[0];
      expect(savedPatient?.identityId).toBe('identity-uuid-booking');
    });

    it('does not call resolveIdentity when patient is found by email (no new patient)', async () => {
      const existingPatient = makePatient();
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(existingPatient);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      expect(mockResolveIdentity.execute).not.toHaveBeenCalled();
      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Google Calendar event ID persistence', () => {
    type MockNotificationService = {
      notify: jest.Mock;
    };

    function makeUseCaseWithNotification(notifResult: {
      meetLink: string | null;
      googleCalendarEventId: string | null;
      channel: string;
    }) {
      const mockNotification: MockNotificationService = {
        notify: jest.fn().mockResolvedValue(notifResult),
      };

      return {
        notificationService: mockNotification,
        useCase: new CreateBookingUseCase(
          mockAppointmentRepo,
          mockPatientRepo,
          mockDoctorLoader,
          mockConsumeUseCase,
          mockCrypto as unknown as import('../../../../../infrastructure/crypto/crypto.service').CryptoService,
          mockSequelize as unknown as import('sequelize-typescript').Sequelize,
          null,
          mockResolveIdentity,
          null,
          mockNotification as unknown as import('../../../../integrations/application/services/appointment-notification.service').AppointmentNotificationService,
        ),
      };
    }

    beforeEach(() => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasSlotConflict.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(makePatient());
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());
    });

    it('persists the googleCalendarEventId when notification returns a non-empty eventId', async () => {
      const { useCase: ucWithNotif } = makeUseCaseWithNotification({
        meetLink: 'https://meet.google.com/abc-123',
        googleCalendarEventId: 'google-evt-xyz',
        channel: 'google_meet',
      });

      await ucWithNotif.execute(makeDto({ appointment_mode: 'online' }));

      expect(mockAppointmentRepo.updateMeetLink).toHaveBeenCalled();
      expect(mockAppointmentRepo.updateGoogleEventId).toHaveBeenCalledWith(
        expect.any(String),
        'google-evt-xyz',
      );
    });

    it('does NOT call updateGoogleEventId when notification returns null eventId (Jitsi fallback)', async () => {
      const { useCase: ucWithNotif } = makeUseCaseWithNotification({
        meetLink: 'https://meet.jit.si/delta-appt-001',
        googleCalendarEventId: null,
        channel: 'jitsi_fallback',
      });

      await ucWithNotif.execute(makeDto({ appointment_mode: 'online' }));

      expect(mockAppointmentRepo.updateGoogleEventId).not.toHaveBeenCalled();
    });

    it('does NOT call updateGoogleEventId when notification returns empty string eventId', async () => {
      const { useCase: ucWithNotif } = makeUseCaseWithNotification({
        meetLink: 'https://meet.google.com/abc',
        googleCalendarEventId: '',
        channel: 'google_meet',
      });

      await ucWithNotif.execute(makeDto({ appointment_mode: 'online' }));

      expect(mockAppointmentRepo.updateGoogleEventId).not.toHaveBeenCalled();
    });

    it('does NOT break booking when notification service throws (best-effort)', async () => {
      const mockNotification = {
        notify: jest.fn().mockRejectedValue(new Error('Google Calendar unavailable')),
      };

      const ucWithFailingNotif = new CreateBookingUseCase(
        mockAppointmentRepo,
        mockPatientRepo,
        mockDoctorLoader,
        mockConsumeUseCase,
        mockCrypto as unknown as import('../../../../../infrastructure/crypto/crypto.service').CryptoService,
        mockSequelize as unknown as import('sequelize-typescript').Sequelize,
        null,
        mockResolveIdentity,
        null,
        mockNotification as unknown as import('../../../../integrations/application/services/appointment-notification.service').AppointmentNotificationService,
      );

      const result = await ucWithFailingNotif.execute(makeDto({ appointment_mode: 'online' }));

      expect(result.appointment).toBeDefined();
      expect(result.meetLink).toBeNull();
      // updateGoogleEventId should NOT be called if notification failed
      expect(mockAppointmentRepo.updateGoogleEventId).not.toHaveBeenCalled();
    });
  });
});
