import { GetPendingCommissionsBySellerUseCase } from './get-pending-commissions-by-seller.use-case';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn(),
    listPendingBySeller: jest.fn().mockResolvedValue([]),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('GetPendingCommissionsBySellerUseCase', () => {
  it('calls listPendingBySeller and returns results', async () => {
    const repo = makeRepo();
    const rows = [
      {
        sellerId: 'seller-1',
        sellerName: 'Vendedor A',
        totalPendingUsd: 20,
        pendingCount: 2,
        commissions: [],
      },
    ];
    repo.listPendingBySeller.mockResolvedValue(rows);
    const useCase = new GetPendingCommissionsBySellerUseCase(repo);

    const result = await useCase.execute();

    expect(repo.listPendingBySeller).toHaveBeenCalledTimes(1);
    expect(result).toEqual(rows);
  });

  it('returns empty array when no pending commissions', async () => {
    const repo = makeRepo();
    const useCase = new GetPendingCommissionsBySellerUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
