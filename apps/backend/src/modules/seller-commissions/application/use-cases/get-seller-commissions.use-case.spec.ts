import { GetSellerCommissionsUseCase } from './get-seller-commissions.use-case';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn().mockResolvedValue([]),
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findPaymentById: jest.fn(),
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('GetSellerCommissionsUseCase', () => {
  it('delegates to repo.listCommissionsBySeller with the given sellerId', async () => {
    const repo = makeRepo();
    const useCase = new GetSellerCommissionsUseCase(repo);

    await useCase.execute('seller-1');

    expect(repo.listCommissionsBySeller).toHaveBeenCalledWith('seller-1');
  });

  it('returns the rows from the repository', async () => {
    const repo = makeRepo();
    const rows = [
      {
        id: 'c-1',
        sellerId: 'seller-1',
        specialistId: 'spec-1',
        specialistName: 'Dr. X',
        type: 'signup' as const,
        amountUsd: 10,
        planKey: null,
        status: 'pending' as const,
        earnedAt: new Date(),
        paymentId: null,
        createdAt: new Date(),
      },
    ];
    repo.listCommissionsBySeller.mockResolvedValue(rows);
    const useCase = new GetSellerCommissionsUseCase(repo);

    const result = await useCase.execute('seller-1');

    expect(result).toEqual(rows);
  });
});
