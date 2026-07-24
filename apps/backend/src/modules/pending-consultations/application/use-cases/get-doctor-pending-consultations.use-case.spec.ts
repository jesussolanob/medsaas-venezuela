import { GetDoctorPendingConsultationsUseCase } from './get-doctor-pending-consultations.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
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

describe('GetDoctorPendingConsultationsUseCase', () => {
  let useCase: GetDoctorPendingConsultationsUseCase;
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
    useCase = new GetDoctorPendingConsultationsUseCase(mockRepo);
  });

  it('returns all pending consultations for a doctor without status filter', async () => {
    const items = [makePc(), makePc({ id: 'pc-002', sessionNumber: 3 })];
    mockRepo.findByDoctor.mockResolvedValue(items);

    const result = await useCase.execute({ doctorId: 'doc-001' });

    expect(result).toHaveLength(2);
    expect(mockRepo.findByDoctor).toHaveBeenCalledWith({ doctorId: 'doc-001', status: undefined });
  });

  it('passes status filter to the repository', async () => {
    mockRepo.findByDoctor.mockResolvedValue([makePc({ status: 'scheduled' })]);

    const result = await useCase.execute({ doctorId: 'doc-001', status: 'scheduled' });

    expect(result[0]?.status).toBe('scheduled');
    expect(mockRepo.findByDoctor).toHaveBeenCalledWith({
      doctorId: 'doc-001',
      status: 'scheduled',
    });
  });

  it('returns an empty array when no records exist', async () => {
    mockRepo.findByDoctor.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: 'doc-001' });

    expect(result).toEqual([]);
  });
});
