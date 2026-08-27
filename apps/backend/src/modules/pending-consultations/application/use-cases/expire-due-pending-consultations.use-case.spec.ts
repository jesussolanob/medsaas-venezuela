import { ExpireDuePendingConsultationsUseCase } from './expire-due-pending-consultations.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import type { IPendingConsultationRepository } from '../../domain/repositories/pending-consultation.repository';

const BASE = new Date('2026-01-01T00:00:00Z');
const PAST = new Date(Date.now() - 86_400_000);

function makePc(id: string) {
  return PendingConsultation.create({
    id,
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Plan',
    sessionNumber: 2,
    status: 'pending_scheduling',
    expiresAt: PAST,
    createdAt: BASE,
    updatedAt: BASE,
  });
}

describe('ExpireDuePendingConsultationsUseCase', () => {
  let useCase: ExpireDuePendingConsultationsUseCase;
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
      getPackageUsage: jest.fn(),
    };
    useCase = new ExpireDuePendingConsultationsUseCase(mockRepo);
  });

  it('expires all due pending consultations and returns the count', async () => {
    const due = [makePc('pc-001'), makePc('pc-002'), makePc('pc-003')];
    mockRepo.findExpired.mockResolvedValue(due);
    mockRepo.bulkExpire.mockResolvedValue();

    const count = await useCase.execute();

    expect(count).toBe(3);
    expect(mockRepo.findExpired).toHaveBeenCalledWith(500);
    expect(mockRepo.bulkExpire).toHaveBeenCalledWith(['pc-001', 'pc-002', 'pc-003']);
  });

  it('returns 0 and does not call bulkExpire when nothing is due', async () => {
    mockRepo.findExpired.mockResolvedValue([]);

    const count = await useCase.execute();

    expect(count).toBe(0);
    expect(mockRepo.bulkExpire).not.toHaveBeenCalled();
  });
});
