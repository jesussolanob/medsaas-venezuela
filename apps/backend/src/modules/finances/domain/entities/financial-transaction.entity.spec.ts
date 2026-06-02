import { FinancialTransaction } from './financial-transaction.entity';
import { Money } from '../value-objects/money.vo';

describe('FinancialTransaction', () => {
  const baseParams = {
    id: 'tx-uuid-1',
    doctorId: 'doc-uuid-1',
    type: 'income' as const,
    amount: new Money(100, 'USD'),
    description: 'Manual consultation fee',
    relatedConsultationId: null,
    date: new Date('2026-06-01T10:00:00Z'),
    createdAt: new Date('2026-06-01T10:00:00Z'),
  };

  it('creates a transaction via static factory', () => {
    const tx = FinancialTransaction.create(baseParams);
    expect(tx.id).toBe('tx-uuid-1');
    expect(tx.doctorId).toBe('doc-uuid-1');
    expect(tx.type).toBe('income');
    expect(tx.amount.amount).toBe(100);
    expect(tx.amount.currency).toBe('USD');
    expect(tx.description).toBe('Manual consultation fee');
    expect(tx.relatedConsultationId).toBeNull();
  });

  it('creates an expense transaction', () => {
    const tx = FinancialTransaction.create({ ...baseParams, type: 'expense' });
    expect(tx.type).toBe('expense');
  });

  it('carries a relatedConsultationId when provided', () => {
    const tx = FinancialTransaction.create({
      ...baseParams,
      relatedConsultationId: 'cons-uuid-1',
    });
    expect(tx.relatedConsultationId).toBe('cons-uuid-1');
  });

  describe('isOwnedBy', () => {
    it('returns true when the actor is the doctor owner', () => {
      const tx = FinancialTransaction.create(baseParams);
      expect(tx.isOwnedBy('doc-uuid-1')).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const tx = FinancialTransaction.create(baseParams);
      expect(tx.isOwnedBy('other-uuid')).toBe(false);
    });
  });
});
