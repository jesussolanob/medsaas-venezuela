import { AccruePlanCommissionUseCase } from './accrue-plan-commission.use-case';
import type {
  ISellerCommissionRepository,
  SpecialistCommissionProfile,
} from '../../domain/repositories/seller-commission.repository';

const SPECIALIST_ID = 'spec-1';
const SELLER_ID = 'seller-1';

function makeProfile(
  overrides: Partial<SpecialistCommissionProfile> = {},
): SpecialistCommissionProfile {
  return {
    specialistId: SPECIALIST_ID,
    soldBy: SELLER_ID,
    soldBySource: 'code',
    sellerIsActive: true,
    ...overrides,
  };
}

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn().mockResolvedValue(makeProfile()),
    accrueCommission: jest.fn().mockResolvedValue('created'),
    listCommissionsBySeller: jest.fn(),
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

describe('AccruePlanCommissionUseCase', () => {
  let repo: jest.Mocked<ISellerCommissionRepository>;
  let useCase: AccruePlanCommissionUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new AccruePlanCommissionUseCase(repo);
  });

  it('creates $10 commission for delta_base plan', async () => {
    const result = await useCase.execute(SPECIALIST_ID, 'delta_base');

    expect(result).toBe('created');
    expect(repo.accrueCommission).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'plan',
        amountUsd: 10,
        planKey: 'delta_base',
      }),
    );
  });

  it('creates $20 commission for delta_plus plan', async () => {
    const result = await useCase.execute(SPECIALIST_ID, 'delta_plus');

    expect(result).toBe('created');
    expect(repo.accrueCommission).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'plan',
        amountUsd: 20,
        planKey: 'delta_plus',
      }),
    );
  });

  it('returns "skipped" for non-paid plans (delta_free)', async () => {
    const result = await useCase.execute(SPECIALIST_ID, 'delta_free');

    expect(result).toBe('skipped');
    expect(repo.findSpecialistCommissionProfile).not.toHaveBeenCalled();
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" for free_trial plan', async () => {
    const result = await useCase.execute(SPECIALIST_ID, 'free_trial');

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" when specialist not found', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(null);

    const result = await useCase.execute(SPECIALIST_ID, 'delta_base');

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" when sold_by is null', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(
      makeProfile({ soldBy: null, soldBySource: null }),
    );

    const result = await useCase.execute(SPECIALIST_ID, 'delta_plus');

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" when seller is inactive', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(makeProfile({ sellerIsActive: false }));

    const result = await useCase.execute(SPECIALIST_ID, 'delta_base');

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('generates commission even when sold_by_source is "admin"', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(makeProfile({ soldBySource: 'admin' }));

    const result = await useCase.execute(SPECIALIST_ID, 'delta_base');

    expect(result).toBe('created');
    expect(repo.accrueCommission).toHaveBeenCalledTimes(1);
  });

  it('returns "duplicate" when commission already exists (idempotent)', async () => {
    repo.accrueCommission.mockResolvedValue('duplicate');

    const result = await useCase.execute(SPECIALIST_ID, 'delta_base');

    expect(result).toBe('duplicate');
    expect(repo.accrueCommission).toHaveBeenCalledTimes(1);
  });
});
