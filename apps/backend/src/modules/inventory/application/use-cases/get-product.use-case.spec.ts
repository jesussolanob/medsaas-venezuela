import { GetProductUseCase } from './get-product.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import { Product } from '../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'eeeeeeee-0000-0000-0000-000000000002';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeProduct(): Product {
  return Product.create({
    id: PRODUCT_ID,
    doctorId: DOCTOR_ID,
    name: 'Crema A',
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
    listMovements: jest.fn(),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
  };
}

function makeStorage(): jest.Mocked<IStoragePort> {
  return { upload: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue('https://x.y/s') };
}

describe('GetProductUseCase', () => {
  it('returns the product when found', async () => {
    const uc = new GetProductUseCase(makeRepo(makeProduct()), makeStorage());
    const out = await uc.execute(PRODUCT_ID, DOCTOR_ID);
    expect(out.id).toBe(PRODUCT_ID);
    expect(out.name).toBe('Crema A');
  });

  it('throws ProductNotFoundError when product is missing', async () => {
    const uc = new GetProductUseCase(makeRepo(null), makeStorage());
    await expect(uc.execute('missing-id', DOCTOR_ID)).rejects.toThrow(ProductNotFoundError);
  });

  /**
   * Test §8-5 (anti-IDOR): product of another doctor returns the SAME error
   * as a non-existent product (repository scopes by doctorId and returns null).
   */
  it("§8-5 anti-IDOR: another doctor's product returns ProductNotFoundError", async () => {
    const repo = makeRepo(null); // repo returns null for foreign doctorId
    const uc = new GetProductUseCase(repo, makeStorage());
    await expect(uc.execute(PRODUCT_ID, OTHER_DOCTOR)).rejects.toThrow(ProductNotFoundError);
    expect(repo.findByIdForDoctor).toHaveBeenCalledWith(PRODUCT_ID, OTHER_DOCTOR);
  });
});
