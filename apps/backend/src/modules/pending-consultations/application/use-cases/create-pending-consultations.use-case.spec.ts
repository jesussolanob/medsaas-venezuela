import { CreatePendingConsultationsUseCase } from './create-pending-consultations.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import type { IPendingConsultationRepository } from '../../domain/repositories/pending-consultation.repository';

const BASE = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date(Date.now() + 86_400_000 * 30);

function makePc(sessionNumber: number) {
  return PendingConsultation.create({
    id: `pc-${sessionNumber}`,
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete Ortopedia',
    sessionNumber,
    status: 'pending_scheduling',
    createdAt: BASE,
    updatedAt: BASE,
  });
}

describe('CreatePendingConsultationsUseCase', () => {
  let useCase: CreatePendingConsultationsUseCase;
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
    useCase = new CreatePendingConsultationsUseCase(mockRepo);
  });

  it('bulk-creates one pending consultation per session number', async () => {
    const created = [makePc(2), makePc(3), makePc(4)];
    mockRepo.bulkCreate.mockResolvedValue(created);

    const result = await useCase.execute({
      doctorId: 'doc-001',
      patientId: 'pat-001',
      planName: 'Paquete Ortopedia',
      sessionNumbers: [2, 3, 4],
      expiresAt: FUTURE,
    });

    expect(result).toHaveLength(3);
    expect(mockRepo.bulkCreate).toHaveBeenCalledTimes(1);

    const calledItems = mockRepo.bulkCreate.mock.calls[0]?.[0];
    expect(calledItems).toHaveLength(3);
    expect(calledItems?.map((i) => i.sessionNumber)).toEqual([2, 3, 4]);
    expect(calledItems?.[0]?.doctorId).toBe('doc-001');
    expect(calledItems?.[0]?.expiresAt).toBe(FUTURE);
  });

  it('returns empty array without calling repo when sessionNumbers is empty', async () => {
    const result = await useCase.execute({
      doctorId: 'doc-001',
      patientId: 'pat-001',
      planName: 'Plan',
      sessionNumbers: [],
    });

    expect(result).toEqual([]);
    expect(mockRepo.bulkCreate).not.toHaveBeenCalled();
  });

  it('passes optional fields through to bulkCreate items', async () => {
    mockRepo.bulkCreate.mockResolvedValue([makePc(2)]);

    await useCase.execute({
      doctorId: 'doc-001',
      patientId: 'pat-001',
      authUserId: 'auth-001',
      packageId: 'pkg-001',
      paymentId: 'pay-001',
      planName: 'Plan Plus',
      officeId: 'office-001',
      appointmentMode: 'presencial',
      sessionNumbers: [2],
      expiresAt: FUTURE,
    });

    const calledItems = mockRepo.bulkCreate.mock.calls[0]?.[0];
    expect(calledItems?.[0]?.authUserId).toBe('auth-001');
    expect(calledItems?.[0]?.packageId).toBe('pkg-001');
    expect(calledItems?.[0]?.paymentId).toBe('pay-001');
    expect(calledItems?.[0]?.officeId).toBe('office-001');
    expect(calledItems?.[0]?.appointmentMode).toBe('presencial');
  });

  it('passes the transaction to bulkCreate', async () => {
    mockRepo.bulkCreate.mockResolvedValue([makePc(2)]);
    const fakeTransaction = {} as import('sequelize').Transaction;

    await useCase.execute({
      doctorId: 'doc-001',
      patientId: 'pat-001',
      planName: 'Plan',
      sessionNumbers: [2],
      transaction: fakeTransaction,
    });

    expect(mockRepo.bulkCreate).toHaveBeenCalledWith(expect.any(Array), fakeTransaction);
  });
});
