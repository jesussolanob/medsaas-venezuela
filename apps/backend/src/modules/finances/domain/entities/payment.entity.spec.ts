import { Payment } from './payment.entity';
import { InvalidPaymentTransitionError } from '../errors/invalid-payment-transition.error';

const makePayment = (overrides: Partial<Parameters<typeof Payment.create>[0]> = {}) =>
  Payment.create({
    id: 'pay-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    amountUsd: 30,
    status: 'pending',
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
    ...overrides,
  });

describe('Payment entity', () => {
  describe('create()', () => {
    it('creates a payment with default status=pending', () => {
      const p = makePayment();
      expect(p.id).toBe('pay-001');
      expect(p.status).toBe('pending');
      expect(p.paidAt).toBeNull();
      expect(p.currency).toBe('USD');
    });

    it('accepts optional fields as null when not provided', () => {
      const p = makePayment();
      expect(p.amountBs).toBeNull();
      expect(p.bcvRate).toBeNull();
      expect(p.methodSnapshot).toBeNull();
      expect(p.packageId).toBeNull();
    });

    it('stores provided optional fields', () => {
      const p = makePayment({
        amountBs: 1200,
        bcvRate: 40,
        methodSnapshot: 'pago_movil',
        packageId: 'pkg-001',
        paymentCode: 'BK-001',
      });
      expect(p.amountBs).toBe(1200);
      expect(p.bcvRate).toBe(40);
      expect(p.methodSnapshot).toBe('pago_movil');
      expect(p.packageId).toBe('pkg-001');
      expect(p.paymentCode).toBe('BK-001');
    });
  });

  describe('approve()', () => {
    it('transitions pending → approved and sets paidAt', () => {
      const before = Date.now();
      const approved = makePayment().approve();
      const after = Date.now();

      expect(approved.status).toBe('approved');
      expect(approved.paidAt).toBeInstanceOf(Date);
      expect(approved.paidAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(approved.paidAt!.getTime()).toBeLessThanOrEqual(after);
    });

    it('returns a new immutable instance', () => {
      const original = makePayment();
      const approved = original.approve();
      expect(original.status).toBe('pending');
      expect(approved.status).toBe('approved');
    });

    it('throws InvalidPaymentTransitionError when already approved', () => {
      const approved = makePayment({ status: 'approved', paidAt: new Date() });
      expect(() => approved.approve()).toThrow(InvalidPaymentTransitionError);
    });
  });

  describe('markPending()', () => {
    it('transitions approved → pending and clears paidAt', () => {
      const approved = makePayment({ status: 'approved', paidAt: new Date() });
      const pending = approved.markPending();

      expect(pending.status).toBe('pending');
      expect(pending.paidAt).toBeNull();
    });

    it('returns a new immutable instance', () => {
      const approved = makePayment({ status: 'approved', paidAt: new Date() });
      const pending = approved.markPending();
      expect(approved.status).toBe('approved');
      expect(pending.status).toBe('pending');
    });

    it('throws InvalidPaymentTransitionError when already pending', () => {
      const pending = makePayment();
      expect(() => pending.markPending()).toThrow(InvalidPaymentTransitionError);
    });
  });

  describe('isOwnedBy()', () => {
    it('returns true for the owning doctor', () => {
      const p = makePayment({ doctorId: 'doc-001' });
      expect(p.isOwnedBy('doc-001')).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const p = makePayment({ doctorId: 'doc-001' });
      expect(p.isOwnedBy('doc-999')).toBe(false);
    });
  });
});
