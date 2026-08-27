import { SchedulePendingConsultationUseCase } from './schedule-pending-consultation.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import { PendingConsultationNotFoundError } from '../../domain/errors/pending-consultation-not-found.error';
import { PendingConsultationNotSchedulableError } from '../../domain/errors/pending-consultation-not-schedulable.error';
import { PendingConsultationExpiredError } from '../../domain/errors/pending-consultation-expired.error';
import type { IPendingConsultationRepository } from '../../domain/repositories/pending-consultation.repository';
import type { IAppointmentRepository } from '../../../appointments/domain/repositories/appointment.repository';
import { AppointmentConflictError } from '../../../appointments/domain/errors/appointment-conflict.error';

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

    mockSequelize = makeSequelizeMock();

    useCase = new SchedulePendingConsultationUseCase(
      mockPendingRepo,
      mockAppointmentRepo,
      mockSequelize as never,
      null, // no CreateConsultationUseCase in unit tests
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
});
