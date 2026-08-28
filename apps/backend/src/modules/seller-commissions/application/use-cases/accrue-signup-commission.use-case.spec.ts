import { AccrueSignupCommissionUseCase } from './accrue-signup-commission.use-case';
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
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('AccrueSignupCommissionUseCase', () => {
  let repo: jest.Mocked<ISellerCommissionRepository>;
  let useCase: AccrueSignupCommissionUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new AccrueSignupCommissionUseCase(repo);
  });

  it('returns "created" and accrues $10 commission for code-attributed specialist', async () => {
    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('created');
    expect(repo.accrueCommission).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: SELLER_ID,
        specialistId: SPECIALIST_ID,
        type: 'signup',
        amountUsd: 10,
        planKey: null,
      }),
    );
  });

  it('returns "duplicate" when commission already exists', async () => {
    repo.accrueCommission.mockResolvedValue('duplicate');

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('duplicate');
    expect(repo.accrueCommission).toHaveBeenCalledTimes(1);
  });

  it('returns "skipped" when specialist not found', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(null);

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" when sold_by is null (no seller attributed)', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(
      makeProfile({ soldBy: null, soldBySource: null }),
    );

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" when sold_by_source is "admin" (not code-path)', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(makeProfile({ soldBySource: 'admin' }));

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" when the seller is inactive', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(makeProfile({ sellerIsActive: false }));

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Eligible attribution sources — the seller brought the specialist in
  // ---------------------------------------------------------------------------

  it('accrues for a specialist the seller loaded by hand ("seller_manual")', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(
      makeProfile({ soldBySource: 'seller_manual' }),
    );

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('created');
    expect(repo.accrueCommission).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signup', amountUsd: 10, sellerId: SELLER_ID }),
    );
  });

  it('returns "skipped" when sold_by_source is null even though sold_by is set', async () => {
    // Regression guard: writing sold_by without sold_by_source used to silently
    // kill every signup commission. The source has to travel with the attribution.
    repo.findSpecialistCommissionProfile.mockResolvedValue(makeProfile({ soldBySource: null }));

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });

  it('returns "skipped" for an unknown attribution source', async () => {
    repo.findSpecialistCommissionProfile.mockResolvedValue(
      makeProfile({ soldBySource: 'something_new' }),
    );

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toBe('skipped');
    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });
});
