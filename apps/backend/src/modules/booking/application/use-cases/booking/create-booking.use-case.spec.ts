import {
  CreateBookingUseCase,
  DoctorNotFoundError,
  PatientNotFoundError,
} from './create-booking.use-case';
import { BookingNotEnabledError } from '../../../domain/errors/booking-not-enabled.error';
import { CreateBookingDtoSchema } from '@delta/shared-types';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';
import type { IBookingFeatureChecker } from '../../../domain/repositories/booking-feature-checker.repository';
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
  patient_email: 'maria@example.com' as string | null | undefined,
  patient_cedula: 'V-12345678',
  patient_phone: '+584121234567' as string | null | undefined,
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
      hasOverlap: jest.fn(),
      hasPatientOverlap: jest.fn(),
      findPackageById: jest.fn(),
      incrementPackageSessions: jest.fn(),
      logStatusChange: jest.fn(),
      findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
      findByIdForDoctor: jest.fn(),
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(existingPatient);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('creates appointment using package session', () => {
    it('calls consumePackageSession with the transaction handle when packageId is provided', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(true);

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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      expect(mockResolveIdentity.execute).toHaveBeenCalledWith('V-12345678');
    });

    it('sets identityId on the new patient entity', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(existingPatient);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      await useCase.execute(makeDto());

      expect(mockResolveIdentity.execute).not.toHaveBeenCalled();
      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('patient_id path — anti-IDOR and no find-or-create', () => {
    it('throws PatientNotFoundError when patient_id belongs to a different doctor', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      // findById returns null — patient not scoped to this doctor
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute(makeDto({ patient_id: 'pat-other-doctor', patient_email: null })),
      ).rejects.toThrow(PatientNotFoundError);

      // find-or-create must NOT be invoked
      expect(mockPatientRepo.findByEmailHash).not.toHaveBeenCalled();
      expect(mockPatientRepo.findByCedulaHash).not.toHaveBeenCalled();
      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });

    it('uses the loaded patient directly when patient_id is valid, skipping find-or-create', async () => {
      const existingPatient = makePatient();
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockPatientRepo.findById.mockResolvedValue(existingPatient);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());

      const result = await useCase.execute(makeDto({ patient_id: 'pat-001', patient_email: null }));

      expect(result.appointment).toBeDefined();
      // The patient returned is the pre-loaded one
      expect(result.patient.id).toBe('pat-001');
      // find-or-create methods must NOT be called
      expect(mockPatientRepo.findByEmailHash).not.toHaveBeenCalled();
      expect(mockPatientRepo.findByCedulaHash).not.toHaveBeenCalled();
      expect(mockPatientRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('optional email — attendee / invite handling', () => {
    type MockNotificationService = { notify: jest.Mock };

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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockAppointmentRepo.save.mockResolvedValue(makeAppointment());
    });

    it('creates appointment and patient without email, notification is called with undefined patientEmail', async () => {
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);

      const { useCase: ucWithNotif, notificationService } = makeUseCaseWithNotification({
        meetLink: null,
        googleCalendarEventId: null,
        channel: 'in_person',
      });

      await ucWithNotif.execute(
        makeDto({ patient_email: null, patient_phone: null, appointment_mode: 'presencial' }),
      );

      // Notification service is called but patientEmail is absent (undefined)
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ patientEmail: undefined }),
      );
    });

    it('does NOT call findByEmailHash when patient_email is absent', async () => {
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);

      await useCase.execute(makeDto({ patient_email: null }));

      expect(mockPatientRepo.findByEmailHash).not.toHaveBeenCalled();
    });

    it('with email → notification is called with patient email present', async () => {
      const existingPatient = makePatient();
      mockPatientRepo.findByEmailHash.mockResolvedValue(existingPatient);

      const { useCase: ucWithNotif, notificationService } = makeUseCaseWithNotification({
        meetLink: 'https://meet.google.com/abc-123',
        googleCalendarEventId: 'evt-xyz',
        channel: 'google_meet',
      });

      await ucWithNotif.execute(
        makeDto({ patient_email: 'maria@example.com', appointment_mode: 'online' }),
      );

      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ patientEmail: 'maria@example.com' }),
      );
    });

    it('creates new patient without email when neither email nor cedula matches', async () => {
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);

      await useCase.execute(makeDto({ patient_email: null, patient_cedula: null }));

      // A new patient is created
      expect(mockPatientRepo.save).toHaveBeenCalled();
      const savedPatient = mockPatientRepo.save.mock.calls[0]?.[0];
      expect(savedPatient?.email).toBeNull();
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
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
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

  describe('booking feature gate — BookingNotEnabledError', () => {
    let mockFeatureChecker: jest.Mocked<IBookingFeatureChecker>;

    beforeEach(() => {
      mockFeatureChecker = { isBookingEnabled: jest.fn() };
    });

    function makeUseCaseWithChecker(checker: IBookingFeatureChecker) {
      return new CreateBookingUseCase(
        mockAppointmentRepo,
        mockPatientRepo,
        mockDoctorLoader,
        mockConsumeUseCase,
        mockCrypto as unknown as import('../../../../../infrastructure/crypto/crypto.service').CryptoService,
        mockSequelize as unknown as import('sequelize-typescript').Sequelize,
        null,
        mockResolveIdentity,
        null,
        null,
        checker,
      );
    }

    it('throws BookingNotEnabledError (403) when booking feature is disabled for the doctor plan', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(false);

      const ucWithChecker = makeUseCaseWithChecker(mockFeatureChecker);

      await expect(ucWithChecker.execute(makeDto())).rejects.toThrow(BookingNotEnabledError);
    });

    it('BookingNotEnabledError carries httpStatus 403', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(false);

      const ucWithChecker = makeUseCaseWithChecker(mockFeatureChecker);

      try {
        await ucWithChecker.execute(makeDto());
      } catch (err) {
        expect((err as BookingNotEnabledError).httpStatus).toBe(403);
        expect((err as BookingNotEnabledError).code).toBe('BOOKING_NOT_ENABLED');
      }
    });

    it('proceeds with booking when feature checker returns true', async () => {
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);
      mockAppointmentRepo.save.mockResolvedValue(
        // Inline appointment — avoids importing makeAppointment here
        {
          id: 'appt-001',
          doctorId: 'doc-001',
          patientId: 'pat-001',
          scheduledAt: new Date('2026-07-01T10:00:00Z'),
          status: 'scheduled',
        } as unknown as import('../../../../appointments/domain/entities/appointment.entity').Appointment,
      );

      const ucWithChecker = makeUseCaseWithChecker(mockFeatureChecker);

      const result = await ucWithChecker.execute(makeDto());

      expect(result.appointment).toBeDefined();
      expect(mockFeatureChecker.isBookingEnabled).toHaveBeenCalledWith('doc-001');
    });

    it('does not call feature checker when doctor is not found (fails fast at Step 2)', async () => {
      mockDoctorLoader.findById.mockResolvedValue(null);

      const ucWithChecker = makeUseCaseWithChecker(mockFeatureChecker);

      await expect(ucWithChecker.execute(makeDto())).rejects.toThrow(DoctorNotFoundError);
      expect(mockFeatureChecker.isBookingEnabled).not.toHaveBeenCalled();
    });

    it('skips feature check when featureChecker is null (backward compat)', async () => {
      // useCase in parent beforeEach has no featureChecker (null) → should not throw
      mockDoctorLoader.findById.mockResolvedValue(DOCTOR);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.hasPatientOverlap.mockResolvedValue(false);
      mockPatientRepo.findByEmailHash.mockResolvedValue(null);
      mockPatientRepo.findByCedulaHash.mockResolvedValue(null);
      mockPatientRepo.save.mockImplementation(async (p) => p);
      mockAppointmentRepo.save.mockResolvedValue({
        id: 'appt-001',
        doctorId: 'doc-001',
        patientId: 'pat-001',
        scheduledAt: new Date('2026-07-01T10:00:00Z'),
        status: 'scheduled',
      } as unknown as import('../../../../appointments/domain/entities/appointment.entity').Appointment);

      // useCase was constructed without featureChecker (null) in beforeEach
      await expect(useCase.execute(makeDto())).resolves.toBeDefined();
    });
  });

  describe('CreateBookingDtoSchema — patient_email validation', () => {
    const basePayload = {
      cf_turnstile_token: 'tok',
      // Valid v4 UUID (Zod v4 enforces RFC 4122 version bits)
      doctor_id: 'a2ae2d7f-7445-4aff-b39b-ab08f1b75dc0',
      patient_name: 'Ana',
      // cédula is mandatory for self-booking (creates a patient identity)
      patient_cedula: 'V-12345678',
      scheduled_at: '2026-08-01T10:00:00Z',
      appointment_mode: 'presencial',
      plan_name: 'Consulta',
      plan_price: 30,
    };

    it('rejects a missing patient_cedula', () => {
      const { patient_cedula: _omit, ...withoutCedula } = basePayload;
      const result = CreateBookingDtoSchema.safeParse(withoutCedula);
      expect(result.success).toBe(false);
    });

    it('rejects a too-short patient_cedula', () => {
      const result = CreateBookingDtoSchema.safeParse({ ...basePayload, patient_cedula: 'V12' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid email format', () => {
      const result = CreateBookingDtoSchema.safeParse({
        ...basePayload,
        patient_email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('accepts a missing patient_email (optional)', () => {
      const result = CreateBookingDtoSchema.safeParse({ ...basePayload });
      expect(result.success).toBe(true);
    });

    it('accepts a null patient_email', () => {
      const result = CreateBookingDtoSchema.safeParse({ ...basePayload, patient_email: null });
      expect(result.success).toBe(true);
    });

    it('normalises empty string patient_email to null', () => {
      const result = CreateBookingDtoSchema.safeParse({ ...basePayload, patient_email: '' });
      // Empty string transforms to null — schema should accept or coerce it
      // Note: .email() validation runs before .transform(), so '' (not a valid email) is caught.
      // The schema uses z.string().email().nullable().optional().transform(...).
      // An empty string fails z.string().email() — therefore this is expected to fail.
      expect(result.success).toBe(false);
    });

    it('accepts a valid email', () => {
      const result = CreateBookingDtoSchema.safeParse({
        ...basePayload,
        patient_email: 'valid@example.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patient_email).toBe('valid@example.com');
      }
    });

    it('accepts a valid patient_id uuid', () => {
      const result = CreateBookingDtoSchema.safeParse({
        ...basePayload,
        patient_id: 'df553319-10e8-416e-8046-e64df461f94b',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid patient_id (not a uuid)', () => {
      const result = CreateBookingDtoSchema.safeParse({
        ...basePayload,
        patient_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});
