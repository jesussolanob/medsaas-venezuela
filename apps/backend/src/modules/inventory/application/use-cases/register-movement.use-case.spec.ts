import { RegisterMovementUseCase } from './register-movement.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import { Product } from '../../domain/entities/product.entity';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductInactiveError } from '../../domain/errors/product-inactive.error';
import { InvalidQuantityError } from '../../domain/errors/invalid-quantity.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeProduct(overrides: Partial<ConstructorParameters<typeof Product>[0]> = {}): Product {
  return Product.create({
    id: PRODUCT_ID,
    doctorId: DOCTOR_ID,
    name: 'Crema',
    description: '',
    supplier: null,
    photoPath: null,
    salePriceAmount: 10,
    salePriceCurrency: 'USD',
    stockQty: 10,
    lowStockThreshold: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
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
    applyMovement: jest.fn().mockImplementation((m) => Promise.resolve(m)),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
    findMovementByIdForDoctor: jest.fn(),
    reverseMovement: jest.fn(),
    findProductsByIdsForDoctor: jest.fn(),
    applyBulkMovements: jest.fn(),
  };
}

describe('RegisterMovementUseCase', () => {
  it('applies a purchase movement with positive qty', async () => {
    const repo = makeRepo(makeProduct());
    const uc = new RegisterMovementUseCase(repo);
    await uc.execute(PRODUCT_ID, DOCTOR_ID, { kind: 'purchase', qty: 5 });
    const applied = (repo.applyMovement as jest.Mock).mock.calls[0][0] as InventoryMovement;
    expect(applied.qty).toBe(5);
    expect(applied.kind).toBe('purchase');
  });

  it('applies a loss movement with negative qty', async () => {
    const repo = makeRepo(makeProduct());
    const uc = new RegisterMovementUseCase(repo);
    await uc.execute(PRODUCT_ID, DOCTOR_ID, { kind: 'loss', qty: 3 });
    const applied = (repo.applyMovement as jest.Mock).mock.calls[0][0] as InventoryMovement;
    expect(applied.qty).toBe(-3);
  });

  it('throws ProductNotFoundError when product is missing', async () => {
    const uc = new RegisterMovementUseCase(makeRepo(null));
    await expect(uc.execute(PRODUCT_ID, DOCTOR_ID, { kind: 'purchase', qty: 5 })).rejects.toThrow(
      ProductNotFoundError,
    );
  });

  it('throws ProductInactiveError when product is inactive', async () => {
    const uc = new RegisterMovementUseCase(makeRepo(makeProduct({ isActive: false })));
    await expect(uc.execute(PRODUCT_ID, DOCTOR_ID, { kind: 'purchase', qty: 5 })).rejects.toThrow(
      ProductInactiveError,
    );
  });

  it('throws InvalidQuantityError when qty is 0', async () => {
    const uc = new RegisterMovementUseCase(makeRepo(makeProduct()));
    await expect(uc.execute(PRODUCT_ID, DOCTOR_ID, { kind: 'adjustment', qty: 0 })).rejects.toThrow(
      InvalidQuantityError,
    );
  });

  /**
   * Test §8-6: sale that leaves stock negative is allowed.
   * RegisterMovement allows any signed qty for 'adjustment', and
   * the repo does not block negative stock.
   */
  it('§8-6 allows negative stock after adjustment debit', async () => {
    const repo = makeRepo(makeProduct({ stockQty: 2 }));
    const uc = new RegisterMovementUseCase(repo);
    // adjustment of -5 would leave stock at -3
    await uc.execute(PRODUCT_ID, DOCTOR_ID, { kind: 'adjustment', qty: -5 });
    const applied = (repo.applyMovement as jest.Mock).mock.calls[0][0] as InventoryMovement;
    expect(applied.qty).toBe(-5); // repo allows it; stock goes negative
  });
});
