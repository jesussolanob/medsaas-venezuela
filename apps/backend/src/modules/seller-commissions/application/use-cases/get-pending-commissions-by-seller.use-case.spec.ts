import { GetPendingCommissionsBySellerUseCase } from './get-pending-commissions-by-seller.use-case';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';
import type { IUsdtRateStore } from '../../../finances/domain/repositories/usdt-rate.store';

const BCV_RATE = 36.5;

function makeRateStore(bcvRate: number | null = BCV_RATE): jest.Mocked<IUsdtRateStore> {
  return {
    getRate: jest.fn(),
    setRate: jest.fn(),
    setSource: jest.fn(),
    getRatesSummary: jest.fn().mockResolvedValue({
      source: 'bcv' as const,
      manual: null,
      binance: null,
      bcv: bcvRate,
      effective: bcvRate,
    }),
  } as jest.Mocked<IUsdtRateStore>;
}

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn(),
    listPendingBySeller: jest.fn().mockResolvedValue([]),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findPaymentById: jest.fn(),
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('GetPendingCommissionsBySellerUseCase', () => {
  it('calls listPendingBySeller and returns sellers with bcvRate', async () => {
    const repo = makeRepo();
    const sellerRows = [
      {
        sellerId: 'seller-1',
        sellerName: 'Vendedor A',
        totalPendingUsd: 20,
        pendingCount: 2,
        commissions: [],
      },
    ];
    repo.listPendingBySeller.mockResolvedValue(sellerRows);
    const useCase = new GetPendingCommissionsBySellerUseCase(repo, makeRateStore(36.5));

    const result = await useCase.execute();

    expect(repo.listPendingBySeller).toHaveBeenCalledTimes(1);
    expect(result.sellers).toEqual(sellerRows);
    expect(result.bcvRate).toBe(36.5);
  });

  it('returns empty sellers array and bcvRate when no pending commissions', async () => {
    const repo = makeRepo();
    const useCase = new GetPendingCommissionsBySellerUseCase(repo, makeRateStore());

    const result = await useCase.execute();

    expect(result.sellers).toEqual([]);
    expect(result.bcvRate).toBe(BCV_RATE);
  });

  it('returns bcvRate null when the rate store returns null bcv', async () => {
    const repo = makeRepo();
    const useCase = new GetPendingCommissionsBySellerUseCase(repo, makeRateStore(null));

    const result = await useCase.execute();

    expect(result.bcvRate).toBeNull();
  });

  it('returns bcvRate null when the rate store throws', async () => {
    const repo = makeRepo();
    const rateStore = makeRateStore();
    rateStore.getRatesSummary.mockRejectedValue(new Error('Redis no disponible'));
    const useCase = new GetPendingCommissionsBySellerUseCase(repo, rateStore);

    const result = await useCase.execute();

    expect(result.bcvRate).toBeNull();
    expect(result.sellers).toEqual([]);
  });
});
