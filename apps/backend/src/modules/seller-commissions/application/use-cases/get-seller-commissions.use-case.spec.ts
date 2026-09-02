import { GetSellerCommissionsUseCase } from './get-seller-commissions.use-case';
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
    listCommissionsBySeller: jest.fn().mockResolvedValue([]),
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findPaymentById: jest.fn(),
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    approveCommissions: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('GetSellerCommissionsUseCase', () => {
  it('delegates to repo.listCommissionsBySeller with the given sellerId', async () => {
    const repo = makeRepo();
    const useCase = new GetSellerCommissionsUseCase(repo, makeRateStore());

    await useCase.execute('seller-1');

    expect(repo.listCommissionsBySeller).toHaveBeenCalledWith('seller-1');
  });

  it('returns commissions and bcvRate from the repository and rate store', async () => {
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
    const useCase = new GetSellerCommissionsUseCase(repo, makeRateStore(36.5));

    const result = await useCase.execute('seller-1');

    expect(result.commissions).toEqual(rows);
    expect(result.bcvRate).toBe(36.5);
  });

  it('returns bcvRate null when the rate store returns null bcv', async () => {
    const repo = makeRepo();
    const useCase = new GetSellerCommissionsUseCase(repo, makeRateStore(null));

    const result = await useCase.execute('seller-1');

    expect(result.bcvRate).toBeNull();
  });

  it('returns bcvRate null when the rate store throws', async () => {
    const repo = makeRepo();
    const rateStore = makeRateStore();
    rateStore.getRatesSummary.mockRejectedValue(new Error('Redis no disponible'));
    const useCase = new GetSellerCommissionsUseCase(repo, rateStore);

    const result = await useCase.execute('seller-1');

    expect(result.bcvRate).toBeNull();
    expect(result.commissions).toEqual([]);
  });
});
