import { SchedulePendingConsultationUseCase } from './schedule-pending-consultation.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import { PendingConsultationNotFoundError } from '../../domain/errors/pending-consultation-not-found.error';
import { PendingConsultationNotSchedulableError } from '../../domain/errors/pending-consultation-not-schedulable.error';
import { PendingConsultationExpiredError } from '../../domain/errors/pending-consultation-expired.error';
import type { IPendingConsultationRepository } from '../../domain/repositories/pending-consultation.repository';
import type { IAppointmentRepository } from '../../../appointments/domain/repositories/appointment.repository';
import { AppointmentConflictError } from '../../../appointments/domain/errors/appointment-conflict.error';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { Patient } from '../../../patients/domain/entities/patient.entity';
import type { CreateConsultationUseCase } from '../../../consultations/application/use-cases/consultations/create-consultation.use-case';

const BASE = new Date('2026-01-01T00:00:00Z');
const FUTURE_EXPIRES = new Date(Date.now() + 86_400_000 * 30);
const PAST_EXPIRES = new Date(Date.now() - 86_400_000);
const SLOT = new Date(Date.now() + 86_400_000 * 2);

function makePc(overrides: Partial<Parameters<typeof PendingConsultation.create>[0]> = {}) {
  return PendingConsultation.create({
    id: 'pc-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete',
    sessionNumber: 2,
    status: 'pending_scheduling',
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  });
}

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pat-001',
    doctorId: 'doc-001',
    authUserId: null,
    fullName: 'María García',
    cedula: '12345678',
    phone: '04121234567',
    email: 'maria@example.com',
    identityId: null,
    source: 'booking',
    birthDate: null,
    age: null,
    sex: null,
    bloodType: null,
    allergies: null,
    chronicConditions: null,
    address: null,
    city: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    notes: null,
    deletedAt: null,
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  } as unknown as Patient;
}

/**
 * Minimal Sequelize mock that immediately invokes the transaction callback.
 * This avoids spinning up a real DB while exercising the transactional logic.
 */
function makeSequelizeMock() {
  return {
    transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({});
    }),
  };
}

describe('SchedulePendingConsultationUseCase', () => {
  let useCase: SchedulePendingConsultationUseCase;
  let mockPendingRepo: jest.Mocked<IPendingConsultationRepository>;
  let mockAppointmentRepo: jest.Mocked<IAppointmentRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;
  let mockSequelize: ReturnType<typeof makeSequelizeMock>;

  beforeEach(() => {
    mockPendingRepo = {
      findById: jest.fn(),
      findByIdAndDoctor: jest.fn(),
      findByDoctor: jest.fn(),
      findExpired: jest.fn(),
      bulkCreate: jest.fn(),
      save: jest.fn(),
      bulkExpire: jest.fn(),
      findDueForReminder: jest.fn(),
      updateReminderStage: jest.fn(),
      getPackageUsage: jest.fn(),
    };

    mockAppointmentRepo = {
      findById: jest.fn(),
      list: jest.fn(),
      save: jest.fn(),
      updateStatus: jest.fn(),
      hasOverlap: jest.fn(),
      hasPatientOverlap: jest.fn(),
      findPackageById: jest.fn(),
      incrementPackageSessions: jest.fn(),
      logStatusChange: jest.fn(),
      findActiveByDoctorAndDateRange: jest.fn(),
      updateScheduledAt: jest.fn(),
      findByIdForDoctor: jest.fn(),
      updateMeetLink: jest.fn(),
      updateGoogleEventId: jest.fn(),
      updateConsultationId: jest.fn(),
      deleteById: jest.fn(),
      findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
      findUpcomingWithoutCalendarEvent: jest.fn().mockResolvedValue([]),
      findByIdScopedEnriched: jest.fn().mockResolvedValue(null),
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

    mockSequelize = makeSequelizeMock();

    useCase = new SchedulePendingConsultationUseCase(
      mockPendingRepo,
      mockAppointmentRepo,
      mockSequelize as never,
      null, // no CreateConsultationUseCase in these baseline tests
      null, // no patientRepo in these baseline tests
    );
  });

  it('schedules a pending consultation and returns the updated entity', async () => {
    const pc = makePc({ expiresAt: FUTURE_EXPIRES });
    const savedAppt = { id: 'appt-001' };
    const scheduledPc = pc.markScheduled('appt-001', null);

    mockPendingRepo.findByIdAndDoctor.mockResolvedValue(pc);
    mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
    mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
    mockAppointmentRepo.updateConsultationId.mockResolvedValue(savedAppt as never);
    mockPendingRepo.save.mockResolvedValue(scheduledPc);

    const result = await useCase.execute({
      id: 'pc-001',
      doctorId: 'doc-001',
      scheduledAt: SLOT,
    });

    expect(result.status).toBe('scheduled');
    expect(result.scheduledAppointmentId).toBe('appt-001');
    expect(mockAppointmentRepo.save).toHaveBeenCalledTimes(1);
    expect(mockPendingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled' }),
      expect.anything(),
    );
  });

  it('throws PendingConsultationNotFoundError when record not found', async () => {
    mockPendingRepo.findByIdAndDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'pc-999', doctorId: 'doc-001', scheduledAt: SLOT }),
    ).rejects.toThrow(PendingConsultationNotFoundError);
  });

  it('throws PendingConsultationNotSchedulableError when status=scheduled', async () => {
    mockPendingRepo.findByIdAndDoctor.mockResolvedValue(makePc({ status: 'scheduled' }));

    await expect(
      useCase.execute({ id: 'pc-001', doctorId: 'doc-001', scheduledAt: SLOT }),
    ).rejects.toThrow(PendingConsultationNotSchedulableError);
  });

  it('throws PendingConsultationExpiredError when expiresAt is in the past', async () => {
    mockPendingRepo.findByIdAndDoctor.mockResolvedValue(makePc({ expiresAt: PAST_EXPIRES }));

    await expect(
      useCase.execute({ id: 'pc-001', doctorId: 'doc-001', scheduledAt: SLOT }),
    ).rejects.toThrow(PendingConsultationExpiredError);
  });

  it('throws AppointmentConflictError when slot is already taken', async () => {
    mockPendingRepo.findByIdAndDoctor.mockResolvedValue(makePc());
    mockAppointmentRepo.hasOverlap.mockResolvedValue(true);

    await expect(
      useCase.execute({ id: 'pc-001', doctorId: 'doc-001', scheduledAt: SLOT }),
    ).rejects.toThrow(AppointmentConflictError);
  });

  it('uses findById (no doctor scope) when doctorId is omitted (token flow)', async () => {
    const pc = makePc();
    const savedAppt = { id: 'appt-001' };
    const scheduledPc = pc.markScheduled('appt-001', null);

    mockPendingRepo.findById.mockResolvedValue(pc);
    mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
    mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
    mockPendingRepo.save.mockResolvedValue(scheduledPc);

    await useCase.execute({ id: 'pc-001', scheduledAt: SLOT });

    expect(mockPendingRepo.findById).toHaveBeenCalledWith('pc-001');
    expect(mockPendingRepo.findByIdAndDoctor).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Patient snapshot (bug fix 2026-09-21)
  // ---------------------------------------------------------------------------

  describe('patient snapshot', () => {
    beforeEach(() => {
      // Wire the use case with a real patientRepo mock for snapshot tests
      useCase = new SchedulePendingConsultationUseCase(
        mockPendingRepo,
        mockAppointmentRepo,
        mockSequelize as never,
        null,
        mockPatientRepo,
      );
    });

    it('populates patient fields on the appointment when patient is found', async () => {
      const pc = makePc();
      const savedAppt = { id: 'appt-001' };
      const scheduledPc = pc.markScheduled('appt-001', null);
      const patient = makePatient();

      mockPendingRepo.findByIdAndDoctor.mockResolvedValue(pc);
      mockPatientRepo.findById.mockResolvedValue(patient);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
      mockPendingRepo.save.mockResolvedValue(scheduledPc);

      await useCase.execute({ id: 'pc-001', doctorId: 'doc-001', scheduledAt: SLOT });

      expect(mockPatientRepo.findById).toHaveBeenCalledWith('pat-001', 'doc-001');
      // Verify the appointment was saved with the patient fields
      const savedApptArg = mockAppointmentRepo.save.mock.calls[0]?.[0] as unknown as {
        patientName: string | null;
        patientPhone: string | null;
        patientEmail: string | null;
        patientCedula: string | null;
      };
      expect(savedApptArg).toBeDefined();
      expect(savedApptArg.patientName).toBe('María García');
      expect(savedApptArg.patientPhone).toBe('04121234567');
      expect(savedApptArg.patientEmail).toBe('maria@example.com');
      expect(savedApptArg.patientCedula).toBe('12345678');
    });

    it('schedules the appointment with null snapshot fields when patient is not found', async () => {
      const pc = makePc();
      const savedAppt = { id: 'appt-001' };
      const scheduledPc = pc.markScheduled('appt-001', null);

      mockPendingRepo.findByIdAndDoctor.mockResolvedValue(pc);
      mockPatientRepo.findById.mockResolvedValue(null); // patient not found
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
      mockPendingRepo.save.mockResolvedValue(scheduledPc);

      // Must not throw — best-effort means the appointment is always created
      const result = await useCase.execute({
        id: 'pc-001',
        doctorId: 'doc-001',
        scheduledAt: SLOT,
      });

      expect(result.status).toBe('scheduled');
      const savedApptArg = mockAppointmentRepo.save.mock.calls[0]?.[0] as unknown as {
        patientName: string | null;
      };
      expect(savedApptArg).toBeDefined();
      expect(savedApptArg.patientName).toBeNull();
    });

    it('schedules the appointment even when patient lookup throws', async () => {
      const pc = makePc();
      const savedAppt = { id: 'appt-001' };
      const scheduledPc = pc.markScheduled('appt-001', null);

      mockPendingRepo.findByIdAndDoctor.mockResolvedValue(pc);
      mockPatientRepo.findById.mockRejectedValue(new Error('DB connection error'));
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
      mockPendingRepo.save.mockResolvedValue(scheduledPc);

      // Must not throw — the DB error on patient lookup is absorbed
      const result = await useCase.execute({
        id: 'pc-001',
        doctorId: 'doc-001',
        scheduledAt: SLOT,
      });

      expect(result.status).toBe('scheduled');
    });
  });

  // ---------------------------------------------------------------------------
  // Post-commit consultation creation (bug fix 2026-09-21)
  // ---------------------------------------------------------------------------

  describe('post-commit consultation creation', () => {
    let mockCreateConsultationUC: jest.Mocked<Pick<CreateConsultationUseCase, 'execute'>>;

    beforeEach(() => {
      mockCreateConsultationUC = { execute: jest.fn() };

      useCase = new SchedulePendingConsultationUseCase(
        mockPendingRepo,
        mockAppointmentRepo,
        mockSequelize as never,
        mockCreateConsultationUC as never,
        null, // no patientRepo needed for these tests
      );
    });

    it('creates the consultation after the transaction commits and links it back', async () => {
      const pc = makePc();
      const savedAppt = { id: 'appt-001' };
      const scheduledPcNoConsult = pc.markScheduled('appt-001', null);
      const scheduledPcWithConsult = scheduledPcNoConsult.withConsultationId('consult-001');
      const consultation = { id: 'consult-001' };

      mockPendingRepo.findByIdAndDoctor.mockResolvedValue(pc);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
      mockAppointmentRepo.updateConsultationId.mockResolvedValue(undefined as never);
      // First save (inside tx): returns scheduledPcNoConsult
      // Second save (post-commit): returns scheduledPcWithConsult
      mockPendingRepo.save
        .mockResolvedValueOnce(scheduledPcNoConsult)
        .mockResolvedValueOnce(scheduledPcWithConsult);
      mockCreateConsultationUC.execute.mockResolvedValue(consultation as never);

      const result = await useCase.execute({
        id: 'pc-001',
        doctorId: 'doc-001',
        scheduledAt: SLOT,
      });

      // Consultation was created after the tx
      expect(mockCreateConsultationUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'appt-001', doctorId: 'doc-001' }),
      );
      // appointmentRepo received the consultationId
      expect(mockAppointmentRepo.updateConsultationId).toHaveBeenCalledWith(
        'appt-001',
        'consult-001',
      );
      // pendingRepo was saved twice (inside tx + post-commit back-fill)
      expect(mockPendingRepo.save).toHaveBeenCalledTimes(2);
      // The second save carries the consultationId. It runs outside the
      // transaction on purpose, so it is asserted on the entity only — whether a
      // transaction argument is passed at all is an implementation detail.
      expect(mockPendingRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ consultationId: 'consult-001' }),
      );
      expect(result.consultationId).toBe('consult-001');
    });

    it('returns the scheduled pending consultation without consultationId when consultation creation fails', async () => {
      const pc = makePc();
      const savedAppt = { id: 'appt-001' };
      const scheduledPcNoConsult = pc.markScheduled('appt-001', null);

      mockPendingRepo.findByIdAndDoctor.mockResolvedValue(pc);
      mockAppointmentRepo.hasOverlap.mockResolvedValue(false);
      mockAppointmentRepo.save.mockResolvedValue(savedAppt as never);
      mockPendingRepo.save.mockResolvedValue(scheduledPcNoConsult);
      mockCreateConsultationUC.execute.mockRejectedValue(new Error('FK violation'));

      // Must not throw — best-effort
      const result = await useCase.execute({
        id: 'pc-001',
        doctorId: 'doc-001',
        scheduledAt: SLOT,
      });

      expect(result.status).toBe('scheduled');
      expect(result.scheduledAppointmentId).toBe('appt-001');
      // Only one save (inside the tx); the post-commit save was skipped after the error
      expect(mockPendingRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
