import { SetDefaultSellerUseCase } from './set-default-seller.use-case';
import { InvalidDefaultSellerError } from '../../../domain/errors/invalid-default-seller.error';
import type { IAdminRepository, AppSetting } from '../../../domain/repositories/admin.repository';
import type { ISellerCommissionRepository } from '../../../../seller-commissions/domain/repositories/seller-commission.repository';

const SELLER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ANOTHER_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const makeAppSetting = (key: string, value: string): AppSetting => ({
  key,
  value,
  updatedAt: new Date('2026-11-18T10:00:00Z'),
});

// ---------------------------------------------------------------------------
// Minimal mocks — only methods called by SetDefaultSellerUseCase
// ---------------------------------------------------------------------------

function makeAdminRepo(): jest.Mocked<Pick<IAdminRepository, 'upsertSetting'>> {
  return { upsertSetting: jest.fn() };
}

function makeCommissionRepo(): jest.Mocked<Pick<ISellerCommissionRepository, 'findSellerById'>> {
  return { findSellerById: jest.fn() };
}

function makeUseCase(
  adminRepo: jest.Mocked<Pick<IAdminRepository, 'upsertSetting'>>,
  commissionRepo: jest.Mocked<Pick<ISellerCommissionRepository, 'findSellerById'>>,
): SetDefaultSellerUseCase {
  return new SetDefaultSellerUseCase(
    adminRepo as unknown as IAdminRepository,
    commissionRepo as unknown as ISellerCommissionRepository,
  );
}

// ---------------------------------------------------------------------------
// Happy path — valid active seller
// ---------------------------------------------------------------------------

describe('SetDefaultSellerUseCase', () => {
  it('persists the seller UUID when the seller is active', async () => {
    const adminRepo = makeAdminRepo();
    const commissionRepo = makeCommissionRepo();

    commissionRepo.findSellerById.mockResolvedValue({ id: SELLER_UUID, isActive: true });
    adminRepo.upsertSetting.mockResolvedValue(makeAppSetting('default_seller_id', SELLER_UUID));

    const useCase = makeUseCase(adminRepo, commissionRepo);
    const result = await useCase.execute({ sellerId: SELLER_UUID });

    expect(commissionRepo.findSellerById).toHaveBeenCalledWith(SELLER_UUID);
    expect(adminRepo.upsertSetting).toHaveBeenCalledWith('default_seller_id', SELLER_UUID);
    expect(result.sellerId).toBe(SELLER_UUID);
    expect(result.setting.key).toBe('default_seller_id');
  });

  it('replaces the previous default with a different active seller', async () => {
    const adminRepo = makeAdminRepo();
    const commissionRepo = makeCommissionRepo();

    commissionRepo.findSellerById.mockResolvedValue({ id: ANOTHER_UUID, isActive: true });
    adminRepo.upsertSetting.mockResolvedValue(makeAppSetting('default_seller_id', ANOTHER_UUID));

    const useCase = makeUseCase(adminRepo, commissionRepo);
    const result = await useCase.execute({ sellerId: ANOTHER_UUID });

    expect(adminRepo.upsertSetting).toHaveBeenCalledWith('default_seller_id', ANOTHER_UUID);
    expect(result.sellerId).toBe(ANOTHER_UUID);
  });

  // ---------------------------------------------------------------------------
  // Clearing the default (null)
  // ---------------------------------------------------------------------------

  it('stores empty string and skips seller lookup when sellerId is null', async () => {
    const adminRepo = makeAdminRepo();
    const commissionRepo = makeCommissionRepo();

    adminRepo.upsertSetting.mockResolvedValue(makeAppSetting('default_seller_id', ''));

    const useCase = makeUseCase(adminRepo, commissionRepo);
    const result = await useCase.execute({ sellerId: null });

    expect(commissionRepo.findSellerById).not.toHaveBeenCalled();
    expect(adminRepo.upsertSetting).toHaveBeenCalledWith('default_seller_id', '');
    expect(result.sellerId).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Validation errors
  // ---------------------------------------------------------------------------

  it('throws InvalidDefaultSellerError when the UUID does not match any seller', async () => {
    const adminRepo = makeAdminRepo();
    const commissionRepo = makeCommissionRepo();

    // findSellerById returns null: UUID does not exist OR role is not 'seller'
    commissionRepo.findSellerById.mockResolvedValue(null);

    const useCase = makeUseCase(adminRepo, commissionRepo);

    await expect(useCase.execute({ sellerId: SELLER_UUID })).rejects.toBeInstanceOf(
      InvalidDefaultSellerError,
    );

    expect(adminRepo.upsertSetting).not.toHaveBeenCalled();
  });

  it('throws InvalidDefaultSellerError when the seller profile is inactive', async () => {
    const adminRepo = makeAdminRepo();
    const commissionRepo = makeCommissionRepo();

    commissionRepo.findSellerById.mockResolvedValue({ id: SELLER_UUID, isActive: false });

    const useCase = makeUseCase(adminRepo, commissionRepo);

    await expect(useCase.execute({ sellerId: SELLER_UUID })).rejects.toBeInstanceOf(
      InvalidDefaultSellerError,
    );

    expect(adminRepo.upsertSetting).not.toHaveBeenCalled();
  });

  it('InvalidDefaultSellerError has httpStatus 422', () => {
    const err = new InvalidDefaultSellerError();
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe('INVALID_DEFAULT_SELLER');
  });

  it('error message is in Spanish', () => {
    const err = new InvalidDefaultSellerError();
    expect(err.message).toMatch(/vendedor/i);
  });

  // ---------------------------------------------------------------------------
  // Settings validation — 'default_seller_id' is protected in UpsertSettingUseCase
  // ---------------------------------------------------------------------------

  it('returns the AppSetting row from the repository', async () => {
    const adminRepo = makeAdminRepo();
    const commissionRepo = makeCommissionRepo();

    const expectedSetting = makeAppSetting('default_seller_id', SELLER_UUID);
    commissionRepo.findSellerById.mockResolvedValue({ id: SELLER_UUID, isActive: true });
    adminRepo.upsertSetting.mockResolvedValue(expectedSetting);

    const useCase = makeUseCase(adminRepo, commissionRepo);
    const result = await useCase.execute({ sellerId: SELLER_UUID });

    expect(result.setting).toEqual(expectedSetting);
  });
});
