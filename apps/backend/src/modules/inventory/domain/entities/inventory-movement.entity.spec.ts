import { InventoryMovement } from './inventory-movement.entity';

const now = new Date('2026-09-01T00:00:00Z');

function makeMovement(
  overrides: Partial<ConstructorParameters<typeof InventoryMovement>[0]> = {},
): InventoryMovement {
  return InventoryMovement.create({
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: 'dddddddd-0000-0000-0000-000000000001',
    productId: 'pppppppp-0000-0000-0000-000000000001',
    kind: 'sale',
    qty: -1,
    unitPriceUsd: 15,
    rateUsed: null,
    rateSource: null,
    consultationId: 'cccccccc-0000-0000-0000-000000000001',
    note: null,
    createdAt: now,
    reversesMovementId: null,
    ...overrides,
  });
}

describe('InventoryMovement entity', () => {
  it('isSale returns true for kind = sale', () => {
    expect(makeMovement({ kind: 'sale' }).isSale()).toBe(true);
  });

  it('isSale returns false for non-sale kinds', () => {
    expect(makeMovement({ kind: 'purchase' }).isSale()).toBe(false);
    expect(makeMovement({ kind: 'adjustment' }).isSale()).toBe(false);
    expect(makeMovement({ kind: 'loss' }).isSale()).toBe(false);
  });

  it('stores rateUsed and rateSource for VES-priced sales', () => {
    const m = makeMovement({ rateUsed: 40.25, rateSource: 'bcv' });
    expect(m.rateUsed).toBe(40.25);
    expect(m.rateSource).toBe('bcv');
  });

  it('defaults reversesMovementId to null for regular movements', () => {
    expect(makeMovement().reversesMovementId).toBeNull();
  });

  it('stores reversesMovementId for counter-entry movements', () => {
    const originalId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const m = makeMovement({ reversesMovementId: originalId });
    expect(m.reversesMovementId).toBe(originalId);
  });
});
