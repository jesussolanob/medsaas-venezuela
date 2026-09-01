import { Product } from './product.entity';

const DOCTOR_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const now = new Date('2026-09-01T00:00:00Z');

function makeProduct(overrides: Partial<ConstructorParameters<typeof Product>[0]> = {}): Product {
  return Product.create({
    id: 'cccccccc-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    name: 'Crema hidratante',
    description: '',
    supplier: null,
    photoPath: null,
    salePriceAmount: 15,
    salePriceCurrency: 'USD',
    stockQty: 10,
    lowStockThreshold: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Product entity', () => {
  it('isOwnedBy returns true for the owner', () => {
    const p = makeProduct();
    expect(p.isOwnedBy(DOCTOR_ID)).toBe(true);
  });

  it('isOwnedBy returns false for a different doctor — anti-IDOR', () => {
    const p = makeProduct();
    expect(p.isOwnedBy(OTHER_ID)).toBe(false);
  });

  it('isLowStock returns false when no threshold is set', () => {
    const p = makeProduct({ stockQty: 0, lowStockThreshold: null });
    expect(p.isLowStock()).toBe(false);
  });

  it('isLowStock returns true when stock <= threshold', () => {
    const p = makeProduct({ stockQty: 3, lowStockThreshold: 5 });
    expect(p.isLowStock()).toBe(true);
  });

  it('isLowStock returns false when stock > threshold', () => {
    const p = makeProduct({ stockQty: 6, lowStockThreshold: 5 });
    expect(p.isLowStock()).toBe(false);
  });

  it('stockQty can be negative (avisa pero no bloquea)', () => {
    const p = makeProduct({ stockQty: -2 });
    expect(p.stockQty).toBe(-2);
    expect(p.isActive).toBe(true);
  });
});
