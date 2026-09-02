import { GetSellerPendingSummaryUseCase } from './get-seller-pending-summary.use-case';
import type {
  ISellerCommissionRepository,
  CommissionRow,
} from '../../domain/repositories/seller-commission.repository';

const SELLER_ID = 'seller-uuid-001';

function makeRow(overrides: Partial<CommissionRow> = {}): CommissionRow {
  return {
    id: 'commission-1',
    sellerId: SELLER_ID,
    specialistId: 'spec-1',
    specialistName: 'Dr. Ramírez',
    type: 'signup',
    amountUsd: 10,
    planKey: null,
    status: 'pending',
    earnedAt: new Date('2026-08-28T00:00:00Z'),
    paymentId: null,
    createdAt: new Date('2026-08-28T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(rows: CommissionRow[] = []): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn().mockResolvedValue(rows),
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

describe('GetSellerPendingSummaryUseCase', () => {
  it('returns zero totals when there are no commissions', async () => {
    const useCase = new GetSellerPendingSummaryUseCase(makeRepo([]));

    const result = await useCase.execute(SELLER_ID);

    expect(result).toEqual({ pendingCommissionsUsd: 0, pendingCommissionsCount: 0 });
  });

  it('sums only pending commissions, ignoring paid ones', async () => {
    const rows = [
      makeRow({ status: 'pending', amountUsd: 10 }),
      makeRow({ id: 'c2', status: 'paid', amountUsd: 20 }),
      makeRow({ id: 'c3', status: 'pending', amountUsd: 10 }),
    ];
    const useCase = new GetSellerPendingSummaryUseCase(makeRepo(rows));

    const result = await useCase.execute(SELLER_ID);

    expect(result.pendingCommissionsCount).toBe(2);
    expect(result.pendingCommissionsUsd).toBe(20);
  });

  it('returns zero when all commissions are paid', async () => {
    const rows = [
      makeRow({ id: 'c1', status: 'paid', amountUsd: 10 }),
      makeRow({ id: 'c2', status: 'paid', amountUsd: 20 }),
    ];
    const useCase = new GetSellerPendingSummaryUseCase(makeRepo(rows));

    const result = await useCase.execute(SELLER_ID);

    expect(result).toEqual({ pendingCommissionsUsd: 0, pendingCommissionsCount: 0 });
  });

  it('delegates to repo.listCommissionsBySeller with the given sellerId', async () => {
    const repo = makeRepo([]);
    const useCase = new GetSellerPendingSummaryUseCase(repo);

    await useCase.execute(SELLER_ID);

    expect(repo.listCommissionsBySeller).toHaveBeenCalledWith(SELLER_ID);
  });

  it('correctly sums amounts with decimals', async () => {
    const rows = [
      makeRow({ id: 'c1', status: 'pending', amountUsd: 10.5 }),
      makeRow({ id: 'c2', status: 'pending', amountUsd: 20.75 }),
    ];
    const useCase = new GetSellerPendingSummaryUseCase(makeRepo(rows));

    const result = await useCase.execute(SELLER_ID);

    expect(result.pendingCommissionsUsd).toBeCloseTo(31.25);
    expect(result.pendingCommissionsCount).toBe(2);
  });
});
