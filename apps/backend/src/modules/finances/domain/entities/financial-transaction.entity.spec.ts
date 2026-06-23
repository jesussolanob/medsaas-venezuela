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

  describe('conceptId', () => {
    it('defaults conceptId to null when not provided', () => {
      const tx = FinancialTransaction.create(baseParams);
      expect(tx.conceptId).toBeNull();
    });

    it('carries conceptId when provided', () => {
      const tx = FinancialTransaction.create({ ...baseParams, conceptId: 'concept-uuid-1' });
      expect(tx.conceptId).toBe('concept-uuid-1');
    });
  });

  describe('patientId', () => {
    it('defaults patientId to null when not provided', () => {
      const tx = FinancialTransaction.create(baseParams);
      expect(tx.patientId).toBeNull();
    });

    it('carries patientId when provided', () => {
      const tx = FinancialTransaction.create({ ...baseParams, patientId: 'patient-uuid-1' });
      expect(tx.patientId).toBe('patient-uuid-1');
    });
  });

  describe('patch()', () => {
    it('returns a new transaction with updated description (immutable)', () => {
      const tx = FinancialTransaction.create(baseParams);
      const patched = tx.patch({ description: 'Urgencia' });
      expect(patched.description).toBe('Urgencia');
      expect(tx.description).toBe('Manual consultation fee');
    });

    it('returns a new transaction with updated amount', () => {
      const tx = FinancialTransaction.create(baseParams);
      const patched = tx.patch({ amount: new Money(250, 'USD') });
      expect(patched.amount.amount).toBe(250);
      expect(tx.amount.amount).toBe(100);
    });

    it('returns a new transaction with updated date', () => {
      const tx = FinancialTransaction.create(baseParams);
      const newDate = new Date('2026-07-01T00:00:00Z');
      const patched = tx.patch({ date: newDate });
      expect(patched.date).toEqual(newDate);
    });

    it('sets conceptId when provided', () => {
      const tx = FinancialTransaction.create(baseParams);
      const patched = tx.patch({ conceptId: 'concept-uuid-1' });
      expect(patched.conceptId).toBe('concept-uuid-1');
    });

    it('sets conceptId to null when explicitly passed null', () => {
      const tx = FinancialTransaction.create({ ...baseParams, conceptId: 'concept-uuid-1' });
      const patched = tx.patch({ conceptId: null });
      expect(patched.conceptId).toBeNull();
    });

    it('preserves existing conceptId when not specified in patch', () => {
      const tx = FinancialTransaction.create({ ...baseParams, conceptId: 'concept-uuid-1' });
      const patched = tx.patch({ description: 'Changed' });
      expect(patched.conceptId).toBe('concept-uuid-1');
    });

    it('sets patientId when provided', () => {
      const tx = FinancialTransaction.create(baseParams);
      const patched = tx.patch({ patientId: 'patient-uuid-1' });
      expect(patched.patientId).toBe('patient-uuid-1');
    });

    it('sets patientId to null when explicitly passed null', () => {
      const tx = FinancialTransaction.create({ ...baseParams, patientId: 'patient-uuid-1' });
      const patched = tx.patch({ patientId: null });
      expect(patched.patientId).toBeNull();
    });

    it('preserves existing patientId when not specified in patch', () => {
      const tx = FinancialTransaction.create({ ...baseParams, patientId: 'patient-uuid-1' });
      const patched = tx.patch({ description: 'Changed' });
      expect(patched.patientId).toBe('patient-uuid-1');
    });

    it('does not change type or doctorId', () => {
      const tx = FinancialTransaction.create(baseParams);
      const patched = tx.patch({ description: 'Changed' });
      expect(patched.type).toBe('income');
      expect(patched.doctorId).toBe('doc-uuid-1');
    });
  });
});
