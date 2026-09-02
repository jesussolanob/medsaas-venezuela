import { ListMovementsUseCase } from './list-movements.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeProduct(): Product {
  return Product.create({
    id: PRODUCT_ID,
    doctorId: DOCTOR_ID,
    name: 'Crema',
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

function makeRepo(product: Product | null): jest.Mocked<IProductRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn().mockResolvedValue(product),
    save: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    listMovements: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
  };
}

describe('ListMovementsUseCase', () => {
  it('returns movement list when product is owned', async () => {
    const repo = makeRepo(makeProduct());
    const uc = new ListMovementsUseCase(repo);
    const result = await uc.execute(PRODUCT_ID, DOCTOR_ID, 1, 20);
    expect(result.items).toHaveLength(0);
    expect(repo.listMovements).toHaveBeenCalledWith(PRODUCT_ID, DOCTOR_ID, 1, 20);
  });

  it('throws ProductNotFoundError for foreign product — anti-IDOR', async () => {
    const uc = new ListMovementsUseCase(makeRepo(null));
    await expect(uc.execute(PRODUCT_ID, DOCTOR_ID, 1, 20)).rejects.toThrow(ProductNotFoundError);
  });
});
