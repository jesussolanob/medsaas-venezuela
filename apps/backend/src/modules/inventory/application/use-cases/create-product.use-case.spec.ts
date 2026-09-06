import { CreateProductUseCase } from './create-product.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import { Product } from '../../domain/entities/product.entity';
import { InvalidPhotoPathError } from '../../domain/errors/invalid-photo-path.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeRepo(saved: Product): jest.Mocked<IProductRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn().mockResolvedValue(saved),
    update: jest.fn(),
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

function makeStorage(): jest.Mocked<IStoragePort> {
  return { upload: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue('https://x.y/s') };
}

describe('CreateProductUseCase', () => {
  it('persists and returns the new product', async () => {
    const saved = Product.create({
      id: 'new-uuid',
      doctorId: DOCTOR_ID,
      name: 'Crema A',
      description: '',
      supplier: null,
      photoPath: null,
      salePriceAmount: 15,
      salePriceCurrency: 'USD',
      stockQty: 0,
      lowStockThreshold: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const repo = makeRepo(saved);
    const uc = new CreateProductUseCase(repo, makeStorage());

    const result = await uc.execute(
      {
        name: 'Crema A',
        description: '',
        sale_price_amount: 15,
        sale_price_currency: 'USD',
        stock_qty: 0,
      },
      DOCTOR_ID,
    );

    expect(repo.save).toHaveBeenCalled();
    expect(result.name).toBe('Crema A');
    expect(result.salePriceCurrency).toBe('USD');
  });

  it('E: throws InvalidPhotoPathError when photo_path does not start with product/<doctorId>/', async () => {
    const uc = new CreateProductUseCase(makeRepo(undefined as never), makeStorage());
    await expect(
      uc.execute(
        {
          name: 'Crema',
          description: '',
          sale_price_amount: 10,
          sale_price_currency: 'USD',
          stock_qty: 0,
          photo_path: `document/${DOCTOR_ID}/secret.pdf`,
        },
        DOCTOR_ID,
      ),
    ).rejects.toThrow(InvalidPhotoPathError);
  });

  it('E: accepts photo_path that starts with product/<doctorId>/', async () => {
    const saved = Product.create({
      id: 'new-uuid',
      doctorId: DOCTOR_ID,
      name: 'Crema',
      description: '',
      supplier: null,
      photoPath: `product/${DOCTOR_ID}/crema.jpg`,
      salePriceAmount: 10,
      salePriceCurrency: 'USD',
      stockQty: 0,
      lowStockThreshold: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const repo = makeRepo(saved);
    const uc = new CreateProductUseCase(repo, makeStorage());
    await expect(
      uc.execute(
        {
          name: 'Crema',
          description: '',
          sale_price_amount: 10,
          sale_price_currency: 'USD',
          stock_qty: 0,
          photo_path: `product/${DOCTOR_ID}/crema.jpg`,
        },
        DOCTOR_ID,
      ),
    ).resolves.not.toThrow();
    expect(repo.save).toHaveBeenCalled();
  });
});
