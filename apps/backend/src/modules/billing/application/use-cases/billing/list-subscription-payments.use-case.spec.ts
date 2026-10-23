import { ListSubscriptionPaymentsUseCase } from './list-subscription-payments.use-case';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import type { ISubscriptionPaymentRepository } from '../../../domain/repositories/subscription-payment.repository';
import type {
  IProfileLookupRepository,
  DoctorProfileSnapshot,
} from '../../../domain/repositories/profile-lookup.repository';

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

const PROFILE_SNAPSHOT: DoctorProfileSnapshot = {
  id: 'doc-1',
  fullName: 'Dr. House',
  email: 'house@hospital.com',
  specialty: 'Diagnóstico',
};

describe('ListSubscriptionPaymentsUseCase', () => {
  let mockRepo: jest.Mocked<ISubscriptionPaymentRepository>;
  let mockProfileLookup: jest.Mocked<IProfileLookupRepository>;
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
    mockProfileLookup = {
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([]),
    };
    useCase = new ListSubscriptionPaymentsUseCase(mockRepo, mockProfileLookup);
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

  it('clamps limit to maximum 1000', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 1000 });

    await useCase.execute({ limit: 9999 });

    expect(mockRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 1000 }));
  });

  it('returns empty result when repository returns nothing', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const result = await useCase.execute({});

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Profile enrichment
  // ---------------------------------------------------------------------------

  it('calls findByIds with distinct doctorIds from payment list', async () => {
    const payments = [makePayment('p1', 'pending'), makePayment('p2', 'approved')];
    mockRepo.list.mockResolvedValue({ items: payments, total: 2, page: 1, limit: 20 });

    await useCase.execute({});

    // Both payments share doctorId 'doc-1' — deduplication means exactly one call
    expect(mockProfileLookup.findByIds).toHaveBeenCalledWith(['doc-1']);
  });

  it('returns profiles map keyed by doctorId', async () => {
    const payments = [makePayment('p1', 'pending')];
    mockRepo.list.mockResolvedValue({ items: payments, total: 1, page: 1, limit: 20 });
    mockProfileLookup.findByIds.mockResolvedValue([PROFILE_SNAPSHOT]);

    const result = await useCase.execute({});

    expect(result.profiles.get('doc-1')).toEqual(PROFILE_SNAPSHOT);
  });

  it('does not call findByIds when payment list is empty', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({});

    expect(mockProfileLookup.findByIds).toHaveBeenCalledWith([]);
  });

  it('returns empty profiles map when profile lookup returns no rows', async () => {
    const payments = [makePayment('p1', 'pending')];
    mockRepo.list.mockResolvedValue({ items: payments, total: 1, page: 1, limit: 20 });
    mockProfileLookup.findByIds.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result.profiles.size).toBe(0);
  });
});
