import { CancelPendingConsultationUseCase } from './cancel-pending-consultation.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import { PendingConsultationNotFoundError } from '../../domain/errors/pending-consultation-not-found.error';
import { PendingConsultationNotSchedulableError } from '../../domain/errors/pending-consultation-not-schedulable.error';
import type { IPendingConsultationRepository } from '../../domain/repositories/pending-consultation.repository';

const BASE = new Date('2026-01-01T00:00:00Z');

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

describe('CancelPendingConsultationUseCase', () => {
  let useCase: CancelPendingConsultationUseCase;
  let mockRepo: jest.Mocked<IPendingConsultationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByIdAndDoctor: jest.fn(),
      findByDoctor: jest.fn(),
      findExpired: jest.fn(),
      bulkCreate: jest.fn(),
      save: jest.fn(),
      bulkExpire: jest.fn(),
      findDueForReminder: jest.fn(),
      updateReminderStage: jest.fn(),
    };
    useCase = new CancelPendingConsultationUseCase(mockRepo);
  });

  it('cancels a pending_scheduling consultation successfully', async () => {
    const pc = makePc();
    const cancelled = pc.markCancelled();
    mockRepo.findByIdAndDoctor.mockResolvedValue(pc);
    mockRepo.save.mockResolvedValue(cancelled);

    const result = await useCase.execute({ id: 'pc-001', doctorId: 'doc-001' });

    expect(result.status).toBe('cancelled');
    expect(mockRepo.findByIdAndDoctor).toHaveBeenCalledWith('pc-001', 'doc-001');
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });

  it('throws PendingConsultationNotFoundError when repo returns null', async () => {
    mockRepo.findByIdAndDoctor.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'pc-999', doctorId: 'doc-001' })).rejects.toThrow(
      PendingConsultationNotFoundError,
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws PendingConsultationNotSchedulableError when status=scheduled', async () => {
    const pc = makePc({ status: 'scheduled' });
    mockRepo.findByIdAndDoctor.mockResolvedValue(pc);

    await expect(useCase.execute({ id: 'pc-001', doctorId: 'doc-001' })).rejects.toThrow(
      PendingConsultationNotSchedulableError,
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws PendingConsultationNotSchedulableError when status=expired', async () => {
    const pc = makePc({ status: 'expired' });
    mockRepo.findByIdAndDoctor.mockResolvedValue(pc);

    await expect(useCase.execute({ id: 'pc-001', doctorId: 'doc-001' })).rejects.toThrow(
      PendingConsultationNotSchedulableError,
    );
  });

  it('throws PendingConsultationNotSchedulableError when status=cancelled', async () => {
    const pc = makePc({ status: 'cancelled' });
    mockRepo.findByIdAndDoctor.mockResolvedValue(pc);

    await expect(useCase.execute({ id: 'pc-001', doctorId: 'doc-001' })).rejects.toThrow(
      PendingConsultationNotSchedulableError,
    );
  });

  it('enforces doctor ownership via findByIdAndDoctor scoping', async () => {
    // findByIdAndDoctor returns null when doctor does not own the record.
    mockRepo.findByIdAndDoctor.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'pc-001', doctorId: 'doc-other' })).rejects.toThrow(
      PendingConsultationNotFoundError,
    );
  });
});
