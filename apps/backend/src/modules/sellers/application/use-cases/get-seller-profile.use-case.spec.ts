import { GetSellerProfileUseCase } from './get-seller-profile.use-case';
import type { ISellerRepository, SellerProfile } from '../../domain/repositories/seller.repository';
import { SellerCodeNotFoundError } from '../../domain/errors/seller-code-not-found.error';

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
    findById: jest.fn(),
    findByCode: jest.fn(),
    codeExists: jest.fn(),
    listSoldSpecialists: jest.fn(),
    findSoldSpecialist: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
  };
}

describe('GetSellerProfileUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: GetSellerProfileUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new GetSellerProfileUseCase(repoMock);
  });

  it('returns the seller profile when found', async () => {
    repoMock.findById.mockResolvedValue(makeSeller());

    const result = await useCase.execute(SELLER_ID);

    expect(repoMock.findById).toHaveBeenCalledWith(SELLER_ID);
    expect(result.sellerCode).toBe('ABCDEF');
    expect(result.fullName).toBe('María González');
    expect(result.id).toBe(SELLER_ID);
  });

  it('throws SellerCodeNotFoundError when seller id has no matching profile', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(useCase.execute(SELLER_ID)).rejects.toBeInstanceOf(SellerCodeNotFoundError);
  });

  it('uses sellerId from the argument — never reads from the request', async () => {
    repoMock.findById.mockResolvedValue(makeSeller({ id: 'other-seller' }));

    await useCase.execute('other-seller');

    expect(repoMock.findById).toHaveBeenCalledWith('other-seller');
  });
});
