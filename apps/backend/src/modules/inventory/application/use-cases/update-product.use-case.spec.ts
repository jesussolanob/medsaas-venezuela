import { UpdateProductUseCase } from './update-product.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import { Product } from '../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeRepo(updated: Product | null): jest.Mocked<IProductRepository> {
  const updateFn = updated
    ? jest.fn().mockResolvedValue(updated)
    : jest.fn().mockRejectedValue(new ProductNotFoundError());
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: updateFn,
    deactivate: jest.fn(),
    listMovements: jest.fn(),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
    findMovementByIdForDoctor: jest.fn(),
    reverseMovement: jest.fn(),
    findProductsByIdsForDoctor: jest.fn(),
    applyBulkMovements: jest.fn(),
  };
}

describe('UpdateProductUseCase', () => {
  it('returns the updated product', async () => {
    const updated = Product.create({
      id: PRODUCT_ID,
      doctorId: DOCTOR_ID,
      name: 'Nuevo nombre',
      description: '',
      supplier: null,
      photoPath: null,
      salePriceAmount: 20,
      salePriceCurrency: 'USD',
      stockQty: 5,
      lowStockThreshold: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const storage: jest.Mocked<IStoragePort> = {
      upload: jest.fn(),
      getSignedUrl: jest.fn().mockResolvedValue('https://x'),
    };
    const uc = new UpdateProductUseCase(makeRepo(updated), storage);
    const result = await uc.execute(PRODUCT_ID, DOCTOR_ID, { name: 'Nuevo nombre' });
    expect(result.name).toBe('Nuevo nombre');
  });

  it('throws ProductNotFoundError when product is not owned', async () => {
    const storage: jest.Mocked<IStoragePort> = {
      upload: jest.fn(),
      getSignedUrl: jest.fn(),
    };
    const uc = new UpdateProductUseCase(makeRepo(null), storage);
    await expect(uc.execute(PRODUCT_ID, DOCTOR_ID, { name: 'x' })).rejects.toThrow(
      ProductNotFoundError,
    );
  });
});
