import { ValidateSellerCodeUseCase } from './validate-seller-code.use-case';
import type { ISellerRepository } from '../../domain/repositories/seller.repository';

function makeRepoMock(): jest.Mocked<ISellerRepository> {
  return {
    createSeller: jest.fn(),
    findById: jest.fn(),
    listSellers: jest.fn(),
    findByCode: jest.fn(),
    codeExists: jest.fn(),
    listSoldSpecialists: jest.fn(),
    findSoldSpecialist: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
  };
}

describe('ValidateSellerCodeUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: ValidateSellerCodeUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new ValidateSellerCodeUseCase(repoMock);
  });

  it('returns valid=true and sellerName when code exists', async () => {
    repoMock.findByCode.mockResolvedValue({
      id: 'seller-1',
      fullName: 'María González',
      sellerCode: 'ABCDEF',
      createdAt: new Date(),
    });

    const result = await useCase.execute('ABCDEF');

    expect(result).toEqual({ valid: true, sellerName: 'María González' });
  });

  it('returns valid=false and null sellerName when code does not exist', async () => {
    repoMock.findByCode.mockResolvedValue(null);

    const result = await useCase.execute('XXXXXX');

    expect(result).toEqual({ valid: false, sellerName: null });
  });

  it('normalises code to uppercase before lookup', async () => {
    repoMock.findByCode.mockResolvedValue(null);

    await useCase.execute('abcdef');

    expect(repoMock.findByCode).toHaveBeenCalledWith('ABCDEF');
  });

  it('trims whitespace from the code', async () => {
    repoMock.findByCode.mockResolvedValue(null);

    await useCase.execute('  ABCDEF  ');

    expect(repoMock.findByCode).toHaveBeenCalledWith('ABCDEF');
  });
});
