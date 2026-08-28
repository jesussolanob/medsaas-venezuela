import { ListSellersUseCase } from './list-sellers.use-case';
import type {
  ISellerRepository,
  SellerAdminRow,
} from '../../domain/repositories/seller.repository';

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
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
  };
}

const row: SellerAdminRow = {
  id: 'ssssssss-0000-0000-0000-000000000001',
  fullName: 'QA Vendedora Prueba',
  email: 'qa.vendedora@example.com',
  sellerCode: 'VEN-4821',
  specialistsCount: 3,
  isActive: true,
  createdAt: new Date('2026-08-17T12:00:00Z'),
  lastSignInAt: null,
};

describe('ListSellersUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: ListSellersUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new ListSellersUseCase(repoMock);
  });

  it('devuelve los vendedores con su código y su conteo de especialistas', async () => {
    repoMock.listSellers.mockResolvedValue([row]);

    const result = await useCase.execute();

    expect(repoMock.listSellers).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.sellerCode).toBe('VEN-4821');
    expect(result[0]?.specialistsCount).toBe(3);
  });

  it('devuelve lista vacía cuando todavía no hay vendedores', async () => {
    repoMock.listSellers.mockResolvedValue([]);

    await expect(useCase.execute()).resolves.toEqual([]);
  });
});
