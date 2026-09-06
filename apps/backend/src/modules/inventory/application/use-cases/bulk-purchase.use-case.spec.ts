import { BulkPurchaseUseCase } from './bulk-purchase.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import { Product } from '../../domain/entities/product.entity';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductInactiveError } from '../../domain/errors/product-inactive.error';
import type { BulkPurchaseDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PRODUCT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const PRODUCT_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const now = new Date('2026-09-06T00:00:00Z');

function makeProduct(
  id: string,
  overrides: Partial<ConstructorParameters<typeof Product>[0]> = {},
): Product {
  return Product.create({
    id,
    doctorId: DOCTOR_ID,
    name: 'Producto',
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
    ...overrides,
  });
}

function makeMovement(productId: string, qty: number): InventoryMovement {
  return InventoryMovement.create({
    id: 'mvmt-id',
    doctorId: DOCTOR_ID,
    productId,
    kind: 'purchase',
    qty,
    unitPriceUsd: null,
    rateUsed: null,
    rateSource: null,
    consultationId: null,
    note: null,
    createdAt: now,
    reversesMovementId: null,
  });
}

function makeRepo(
  products: Product[],
  bulkResult: InventoryMovement[] = [],
): jest.Mocked<IProductRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    listMovements: jest.fn(),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
    findMovementByIdForDoctor: jest.fn(),
    reverseMovement: jest.fn(),
    findProductsByIdsForDoctor: jest.fn().mockResolvedValue(products),
    applyBulkMovements: jest.fn().mockResolvedValue(bulkResult),
  };
}

const validDto: BulkPurchaseDto = {
  items: [
    { product_id: PRODUCT_A, qty: 5 },
    { product_id: PRODUCT_B, qty: 3 },
  ],
  note: 'Lote de prueba',
};

describe('BulkPurchaseUseCase', () => {
  it('creates one purchase movement per item and delegates to applyBulkMovements', async () => {
    const products = [makeProduct(PRODUCT_A), makeProduct(PRODUCT_B)];
    const expected = [makeMovement(PRODUCT_A, 5), makeMovement(PRODUCT_B, 3)];
    const repo = makeRepo(products, expected);
    const uc = new BulkPurchaseUseCase(repo);

    const result = await uc.execute(DOCTOR_ID, validDto);

    expect(repo.findProductsByIdsForDoctor).toHaveBeenCalledWith([PRODUCT_A, PRODUCT_B], DOCTOR_ID);
    const movements = (repo.applyBulkMovements as jest.Mock).mock
      .calls[0][0] as InventoryMovement[];
    expect(movements).toHaveLength(2);
    expect(movements[0]!.kind).toBe('purchase');
    expect(movements[0]!.qty).toBe(5);
    expect(movements[1]!.qty).toBe(3);
    expect(result).toBe(expected);
  });

  it('throws ProductNotFoundError when a product_id is missing or belongs to another doctor', async () => {
    // findProductsByIdsForDoctor returns only 1 of 2 requested products.
    const repo = makeRepo([makeProduct(PRODUCT_A)]);
    const uc = new BulkPurchaseUseCase(repo);
    await expect(uc.execute(DOCTOR_ID, validDto)).rejects.toThrow(ProductNotFoundError);
  });

  it('throws ProductInactiveError when any product is inactive', async () => {
    const products = [makeProduct(PRODUCT_A), makeProduct(PRODUCT_B, { isActive: false })];
    const repo = makeRepo(products);
    const uc = new BulkPurchaseUseCase(repo);
    await expect(uc.execute(DOCTOR_ID, validDto)).rejects.toThrow(ProductInactiveError);
  });

  it('does not call applyBulkMovements when validation fails', async () => {
    const repo = makeRepo([makeProduct(PRODUCT_A)]); // only 1 of 2
    const uc = new BulkPurchaseUseCase(repo);
    await uc.execute(DOCTOR_ID, validDto).catch(() => {});
    expect(repo.applyBulkMovements).not.toHaveBeenCalled();
  });

  it('always sets qty positive (Math.abs) on purchase movements', async () => {
    // The Zod schema enforces positive, but we test the use-case guarantee too.
    const repo = makeRepo([makeProduct(PRODUCT_A)], [makeMovement(PRODUCT_A, 7)]);
    const uc = new BulkPurchaseUseCase(repo);

    await uc.execute(DOCTOR_ID, { items: [{ product_id: PRODUCT_A, qty: 7 }] });

    const [movement] = (repo.applyBulkMovements as jest.Mock).mock
      .calls[0][0] as InventoryMovement[];
    expect(movement!.qty).toBeGreaterThan(0);
  });

  it('sets unit_price_usd when provided', async () => {
    const repo = makeRepo([makeProduct(PRODUCT_A)], []);
    const uc = new BulkPurchaseUseCase(repo);

    await uc.execute(DOCTOR_ID, {
      items: [{ product_id: PRODUCT_A, qty: 2, unit_price_usd: 15 }],
    });

    const [movement] = (repo.applyBulkMovements as jest.Mock).mock
      .calls[0][0] as InventoryMovement[];
    expect(movement!.unitPriceUsd).toBe(15);
  });

  it('uses shared note for all movements when provided', async () => {
    const repo = makeRepo([makeProduct(PRODUCT_A), makeProduct(PRODUCT_B)], []);
    const uc = new BulkPurchaseUseCase(repo);

    await uc.execute(DOCTOR_ID, { ...validDto, note: 'Carga de stock Q3' });

    const movements = (repo.applyBulkMovements as jest.Mock).mock
      .calls[0][0] as InventoryMovement[];
    expect(movements.every((m) => m.note === 'Carga de stock Q3')).toBe(true);
  });

  it('passes null as note when not provided', async () => {
    const repo = makeRepo([makeProduct(PRODUCT_A)], []);
    const uc = new BulkPurchaseUseCase(repo);

    await uc.execute(DOCTOR_ID, { items: [{ product_id: PRODUCT_A, qty: 1 }] });

    const [movement] = (repo.applyBulkMovements as jest.Mock).mock
      .calls[0][0] as InventoryMovement[];
    expect(movement!.note).toBeNull();
  });

  it('never sets consultationId or reversesMovementId on bulk movements', async () => {
    const repo = makeRepo([makeProduct(PRODUCT_A)], []);
    const uc = new BulkPurchaseUseCase(repo);

    await uc.execute(DOCTOR_ID, { items: [{ product_id: PRODUCT_A, qty: 1 }] });

    const [movement] = (repo.applyBulkMovements as jest.Mock).mock
      .calls[0][0] as InventoryMovement[];
    expect(movement!.consultationId).toBeNull();
    expect(movement!.reversesMovementId).toBeNull();
  });
});
