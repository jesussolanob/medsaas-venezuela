import { PaymentItem } from './payment-item.entity';

const makeItem = (overrides: Partial<Parameters<typeof PaymentItem.create>[0]> = {}) =>
  PaymentItem.create({
    id: 'item-001',
    paymentId: 'pay-001',
    doctorId: 'doc-001',
    name: 'Consulta General',
    amountUsd: 30,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
    ...overrides,
  });

describe('PaymentItem entity', () => {
  describe('create()', () => {
    it('creates an item with required fields', () => {
      const item = makeItem();
      expect(item.id).toBe('item-001');
      expect(item.paymentId).toBe('pay-001');
      expect(item.doctorId).toBe('doc-001');
      expect(item.name).toBe('Consulta General');
      expect(item.amountUsd).toBe(30);
    });

    it('defaults optional fields to null', () => {
      const item = makeItem();
      expect(item.sourceType).toBeNull();
      expect(item.sourceId).toBeNull();
    });

    it('stores provided optional fields', () => {
      const item = makeItem({ sourceType: 'plan', sourceId: 'plan-uuid-001' });
      expect(item.sourceType).toBe('plan');
      expect(item.sourceId).toBe('plan-uuid-001');
    });
  });

  describe('isOwnedBy()', () => {
    it('returns true for the owning doctor', () => {
      const item = makeItem({ doctorId: 'doc-001' });
      expect(item.isOwnedBy('doc-001')).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const item = makeItem({ doctorId: 'doc-001' });
      expect(item.isOwnedBy('doc-999')).toBe(false);
    });
  });
});
