import { ListProductsUseCase } from './list-products.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import { Product } from '../../domain/entities/product.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeProduct(id: string, name: string): Product {
  return Product.create({
    id,
    doctorId: DOCTOR_ID,
    name,
    description: '',
    supplier: null,
    photoPath: null,
    salePriceAmount: 10,
    salePriceCurrency: 'USD',
    stockQty: 5,
    lowStockThreshold: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

function makeRepo(items: Product[]): jest.Mocked<IProductRepository> {
  return {
    list: jest.fn().mockResolvedValue({ items, total: items.length, page: 1, limit: 20 }),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    listMovements: jest.fn(),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
  };
}

function makeStorage(): jest.Mocked<IStoragePort> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn().mockResolvedValue('https://storage.example.com/signed'),
  };
}

describe('ListProductsUseCase', () => {
  it('returns paginated products with resolved photo URLs', async () => {
    const products = [makeProduct('p1', 'Crema A'), makeProduct('p2', 'Crema B')];
    const repo = makeRepo(products);
    const storage = makeStorage();
    const uc = new ListProductsUseCase(repo, storage);

    const result = await uc.execute(DOCTOR_ID, { page: 1, limit: 20, active: undefined });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.at(0)?.name).toBe('Crema A');
    expect(repo.list).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      search: undefined,
      active: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('returns null photoUrl when photoPath is null', async () => {
    const repo = makeRepo([makeProduct('p1', 'X')]);
    const storage = makeStorage();
    const uc = new ListProductsUseCase(repo, storage);
    const result = await uc.execute(DOCTOR_ID, { page: 1, limit: 20, active: undefined });
    expect(result.items.at(0)?.photoUrl).toBeNull();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });
});
