import { DeactivateSellerAccountUseCase } from './deactivate-seller-account.use-case';
import type { ISellerRepository, SellerProfile } from '../../domain/repositories/seller.repository';
import { GetSellerPendingSummaryUseCase } from '../../../seller-commissions/application/use-cases/get-seller-pending-summary.use-case';
import { CannotDeactivateSellerRoleError } from '../../domain/errors/cannot-deactivate-seller-role.error';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

const SELLER_ID = 'seller-uuid-001';

function makeSeller(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    id: SELLER_ID,
    fullName: 'María González',
    sellerCode: 'ABCDEF',
    createdAt: new Date('2026-08-16T10:00:00Z'),
    ...overrides,
  };
}

function makeRepoMock(): jest.Mocked<ISellerRepository> {
  return {
    createSeller: jest.fn(),
    findById: jest.fn().mockResolvedValue(makeSeller()),
    listSellers: jest.fn(),
    findByCode: jest.fn(),
    codeExists: jest.fn(),
    listSoldSpecialists: jest.fn(),
    findSoldSpecialist: jest.fn(),
    updateSoldSpecialistContact: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
    deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
  };
}

function makePendingSummaryMock(
  pendingCommissionsUsd = 0,
  pendingCommissionsCount = 0,
): jest.Mocked<Pick<GetSellerPendingSummaryUseCase, 'execute'>> {
  return {
    execute: jest.fn().mockResolvedValue({ pendingCommissionsUsd, pendingCommissionsCount }),
  };
}

function makeUseCase(
  repo: jest.Mocked<ISellerRepository>,
  pendingSummary: jest.Mocked<Pick<GetSellerPendingSummaryUseCase, 'execute'>>,
): DeactivateSellerAccountUseCase {
  return new DeactivateSellerAccountUseCase(
    repo,
    pendingSummary as unknown as GetSellerPendingSummaryUseCase,
  );
}

describe('DeactivateSellerAccountUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let pendingSummaryMock: jest.Mocked<Pick<GetSellerPendingSummaryUseCase, 'execute'>>;
  let useCase: DeactivateSellerAccountUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    repoMock = makeRepoMock();
    pendingSummaryMock = makePendingSummaryMock();
    useCase = makeUseCase(repoMock, pendingSummaryMock);
  });

  // =========================================================================
  // Happy path — sin comisiones pendientes
  // =========================================================================

  it('deactivates the account and reports success with zero pending', async () => {
    const result = await useCase.execute({ sellerId: SELLER_ID, role: 'seller' });

    expect(result).toEqual({
      deactivated: true,
      pendingCommissionsUsd: 0,
      pendingCommissionsCount: 0,
    });
    expect(repoMock.deactivateOwnAccount).toHaveBeenCalledWith(SELLER_ID, null);
  });

  it('deactivates and returns the pending summary when commissions exist', async () => {
    pendingSummaryMock = makePendingSummaryMock(45.5, 3);
    useCase = makeUseCase(repoMock, pendingSummaryMock);

    const result = await useCase.execute({
      sellerId: SELLER_ID,
      role: 'seller',
      reason: 'Cambio de trabajo',
    });

    expect(result).toEqual({
      deactivated: true,
      pendingCommissionsUsd: 45.5,
      pendingCommissionsCount: 3,
    });
    expect(repoMock.deactivateOwnAccount).toHaveBeenCalledWith(SELLER_ID, 'Cambio de trabajo');
  });

  it('stores a blank reason as null rather than an empty string', async () => {
    await useCase.execute({ sellerId: SELLER_ID, role: 'seller', reason: '   ' });

    expect(repoMock.deactivateOwnAccount).toHaveBeenCalledWith(SELLER_ID, null);
  });

  it('accepts an absent reason', async () => {
    await useCase.execute({ sellerId: SELLER_ID, role: 'seller' });

    expect(repoMock.deactivateOwnAccount).toHaveBeenCalledWith(SELLER_ID, null);
  });

  it('deactivates even when there are pending commissions — never blocked', async () => {
    pendingSummaryMock = makePendingSummaryMock(120, 7);
    useCase = makeUseCase(repoMock, pendingSummaryMock);

    await expect(useCase.execute({ sellerId: SELLER_ID, role: 'seller' })).resolves.toMatchObject({
      deactivated: true,
    });

    expect(repoMock.deactivateOwnAccount).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Role guard
  // =========================================================================

  it('refuses a super_admin', async () => {
    await expect(
      useCase.execute({ sellerId: SELLER_ID, role: 'super_admin' }),
    ).rejects.toBeInstanceOf(CannotDeactivateSellerRoleError);

    expect(repoMock.deactivateOwnAccount).not.toHaveBeenCalled();
  });

  it('refuses a doctor', async () => {
    await expect(useCase.execute({ sellerId: SELLER_ID, role: 'doctor' })).rejects.toBeInstanceOf(
      CannotDeactivateSellerRoleError,
    );
  });

  it('does not touch the DB when the role is wrong', async () => {
    await useCase.execute({ sellerId: SELLER_ID, role: 'patient' }).catch(() => undefined);

    expect(repoMock.findById).not.toHaveBeenCalled();
    expect(repoMock.deactivateOwnAccount).not.toHaveBeenCalled();
    expect(pendingSummaryMock.execute).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Profile existence guard
  // =========================================================================

  it('throws SellerNotFoundError when the profile does not exist', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(useCase.execute({ sellerId: SELLER_ID, role: 'seller' })).rejects.toBeInstanceOf(
      SellerNotFoundError,
    );

    expect(repoMock.deactivateOwnAccount).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Anti-IDOR
  // =========================================================================

  it('only ever acts on the id it was given', async () => {
    await useCase.execute({ sellerId: SELLER_ID, role: 'seller' });

    expect(repoMock.findById).toHaveBeenCalledWith(SELLER_ID);
    expect(pendingSummaryMock.execute).toHaveBeenCalledWith(SELLER_ID);
    expect(repoMock.deactivateOwnAccount).toHaveBeenCalledWith(SELLER_ID, null);
  });
});
