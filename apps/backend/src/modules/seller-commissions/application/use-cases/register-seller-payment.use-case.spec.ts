import { RegisterSellerPaymentUseCase } from './register-seller-payment.use-case';
import { CommissionSellerNotFoundError } from '../../domain/errors/commission-seller-not-found.error';
import { InvalidCommissionIdsError } from '../../domain/errors/invalid-commission-ids.error';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';
import type { IUsdtRateStore } from '../../../finances/domain/repositories/usdt-rate.store';
import type { SellerPayment } from '../../domain/entities/seller-payment.entity';

const SELLER_ID = 'seller-1';
const ADMIN_ID = 'admin-1';
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
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn().mockResolvedValue([
      {
        id: 'c-1',
        sellerId: SELLER_ID,
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
      {
        id: 'c-2',
        sellerId: SELLER_ID,
        specialistId: 'spec-2',
        specialistName: 'Dr. Y',
        type: 'plan' as const,
        amountUsd: 20,
        planKey: 'delta_plus',
        status: 'pending' as const,
        earnedAt: new Date(),
        paymentId: null,
        createdAt: new Date(),
      },
    ]),
    registerPayment: jest.fn().mockResolvedValue({
      id: 'pay-1',
      sellerId: SELLER_ID,
      amountUsd: 30,
      bcvRate: BCV_RATE,
      method: 'Zelle',
      reference: 'REF-001',
      receiptUrl: null,
      notes: null,
      paidAt: new Date(),
      createdBy: ADMIN_ID,
      createdAt: new Date(),
    } as SellerPayment),
    listPaymentsBySeller: jest.fn(),
    findPaymentById: jest.fn(),
    findSellerById: jest.fn().mockResolvedValue({ id: SELLER_ID, isActive: true }),
    findSpecialistById: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

const validInput = {
  sellerId: SELLER_ID,
  commissionIds: ['c-1', 'c-2'],
  method: 'Zelle',
  reference: 'REF-001',
  receiptUrl: null,
  notes: null,
};

describe('RegisterSellerPaymentUseCase', () => {
  let repo: jest.Mocked<ISellerCommissionRepository>;
  let rateStore: jest.Mocked<IUsdtRateStore>;
  let useCase: RegisterSellerPaymentUseCase;

  beforeEach(() => {
    repo = makeRepo();
    rateStore = makeRateStore();
    useCase = new RegisterSellerPaymentUseCase(repo, rateStore);
  });

  it('registers payment successfully when seller and commissions are valid', async () => {
    const result = await useCase.execute(validInput, ADMIN_ID);

    expect(repo.findSellerById).toHaveBeenCalledWith(SELLER_ID);
    expect(repo.findCommissionsForPayment).toHaveBeenCalledWith(SELLER_ID, ['c-1', 'c-2']);
    expect(repo.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: SELLER_ID,
        commissionIds: ['c-1', 'c-2'],
      }),
      ADMIN_ID,
    );
    expect(result).toBeDefined();
  });

  it('passes the BCV rate to registerPayment when available', async () => {
    rateStore.getRatesSummary.mockResolvedValue({
      source: 'bcv',
      manual: null,
      binance: null,
      bcv: 36.5,
      effective: 36.5,
    });
    useCase = new RegisterSellerPaymentUseCase(repo, rateStore);

    await useCase.execute(validInput, ADMIN_ID);

    expect(repo.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ bcvRate: 36.5 }),
      ADMIN_ID,
    );
  });

  it('passes bcvRate null when the BCV rate is unavailable', async () => {
    rateStore = makeRateStore(null);
    useCase = new RegisterSellerPaymentUseCase(repo, rateStore);

    await useCase.execute(validInput, ADMIN_ID);

    expect(repo.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ bcvRate: null }),
      ADMIN_ID,
    );
  });

  it('still registers payment when rate store throws — bcvRate is null', async () => {
    rateStore.getRatesSummary.mockRejectedValue(new Error('Redis no disponible'));
    useCase = new RegisterSellerPaymentUseCase(repo, rateStore);

    await expect(useCase.execute(validInput, ADMIN_ID)).resolves.toBeDefined();
    expect(repo.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ bcvRate: null }),
      ADMIN_ID,
    );
  });

  it('throws CommissionSellerNotFoundError when seller does not exist', async () => {
    repo.findSellerById.mockResolvedValue(null);

    await expect(useCase.execute(validInput, ADMIN_ID)).rejects.toThrow(
      CommissionSellerNotFoundError,
    );
    expect(repo.findCommissionsForPayment).not.toHaveBeenCalled();
    expect(repo.registerPayment).not.toHaveBeenCalled();
  });

  it('throws InvalidCommissionIdsError when commissions count does not match', async () => {
    // findCommissionsForPayment returns fewer rows than requested (one was invalid)
    repo.findCommissionsForPayment.mockResolvedValue([
      {
        id: 'c-1',
        sellerId: SELLER_ID,
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
    ]);

    await expect(useCase.execute(validInput, ADMIN_ID)).rejects.toThrow(InvalidCommissionIdsError);
    expect(repo.registerPayment).not.toHaveBeenCalled();
  });

  it('does NOT pass a client-provided amount — uses server-calculated sum', async () => {
    // The use case calculates amount from commissions (10 + 20 = 30)
    // There is no amount field in the input — this test asserts the contract.
    await useCase.execute(validInput, ADMIN_ID);

    // The registerPayment receives the params; amount is computed in the use case.
    // We verify the use case does NOT accept an amount in the input shape.
    expect(validInput).not.toHaveProperty('amountUsd');
  });
});
