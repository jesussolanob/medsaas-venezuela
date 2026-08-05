import { ListSubscriptionPaymentsUseCase } from './list-subscription-payments.use-case';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import type { ISubscriptionPaymentRepository } from '../../../domain/repositories/subscription-payment.repository';

function makePayment(id: string, status: 'pending' | 'approved' | 'rejected'): SubscriptionPayment {
  return SubscriptionPayment.create({
    id,
    doctorId: 'doc-1',
    amountUsd: 50,
    method: 'Zelle',
    referenceNumber: null,
    durationMonths: 1,
    status,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ListSubscriptionPaymentsUseCase', () => {
  let mockRepo: jest.Mocked<ISubscriptionPaymentRepository>;
  let useCase: ListSubscriptionPaymentsUseCase;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      listByDoctor: jest.fn(),
      findById: jest.fn(),
      findPendingByDoctor: jest.fn(),
      save: jest.fn(),
      saveDoctorPayment: jest.fn(),
      approveAndExtend: jest.fn(),
      saveApprovedAndExtend: jest.fn(),
      reject: jest.fn(),
      getFinanceStats: jest.fn(),
    };
    useCase = new ListSubscriptionPaymentsUseCase(mockRepo);
  });

  it('returns all payments when no filter is applied', async () => {
    const payments = [makePayment('p1', 'pending'), makePayment('p2', 'approved')];
    mockRepo.list.mockResolvedValue({ items: payments, total: 2, page: 1, limit: 20 });

    const result = await useCase.execute({});

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockRepo.list).toHaveBeenCalledWith({ status: undefined, page: 1, limit: 20 });
  });

  it('passes status filter to the repository', async () => {
    const payments = [makePayment('p1', 'pending')];
    mockRepo.list.mockResolvedValue({ items: payments, total: 1, page: 1, limit: 20 });

    await useCase.execute({ status: 'pending' });

    expect(mockRepo.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('clamps page to minimum 1', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ page: 0 });

    expect(mockRepo.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('clamps limit to maximum 100', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 });

    await useCase.execute({ limit: 999 });

    expect(mockRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('returns empty result when repository returns nothing', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const result = await useCase.execute({});

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
