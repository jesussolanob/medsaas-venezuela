import { SubscriptionPayment } from './subscription-payment.entity';
import { SubscriptionPaymentAlreadyResolvedError } from '../errors/subscription-payment-already-resolved.error';

function makePayment(overrides: Partial<Parameters<typeof SubscriptionPayment.create>[0]> = {}) {
  return SubscriptionPayment.create({
    id: 'pay-1',
    doctorId: 'doc-1',
    amountUsd: 50,
    method: 'Zelle',
    referenceNumber: 'REF123',
    durationMonths: 1,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('SubscriptionPayment entity', () => {
  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  it('creates a payment with pending status', () => {
    const p = makePayment();
    expect(p.id).toBe('pay-1');
    expect(p.status).toBe('pending');
    expect(p.reviewedBy).toBeNull();
    expect(p.reviewedAt).toBeNull();
  });

  it('exposes all getters correctly', () => {
    const p = makePayment();
    expect(p.doctorId).toBe('doc-1');
    expect(p.amountUsd).toBe(50);
    expect(p.method).toBe('Zelle');
    expect(p.referenceNumber).toBe('REF123');
    expect(p.durationMonths).toBe(1);
  });

  it('toPlain returns a copy with all props', () => {
    const p = makePayment();
    const plain = p.toPlain();
    expect(plain.id).toBe('pay-1');
    expect(plain.status).toBe('pending');
    // Mutating the plain object must not affect the entity
    plain.status = 'approved';
    expect(p.status).toBe('pending');
  });

  // ---------------------------------------------------------------------------
  // approve()
  // ---------------------------------------------------------------------------

  it('approve() transitions pending → approved', () => {
    const p = makePayment();
    const approved = p.approve('admin-1');
    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('admin-1');
    expect(approved.reviewedAt).toBeInstanceOf(Date);
  });

  it('approve() does not mutate the original entity', () => {
    const p = makePayment();
    const approved = p.approve('admin-1');
    expect(p.status).toBe('pending');
    expect(approved.status).toBe('approved');
  });

  it('approve() throws SubscriptionPaymentAlreadyResolvedError when already approved', () => {
    const p = makePayment({ status: 'approved', reviewedBy: 'admin-1', reviewedAt: new Date() });
    expect(() => p.approve('admin-2')).toThrow(SubscriptionPaymentAlreadyResolvedError);
  });

  it('approve() throws SubscriptionPaymentAlreadyResolvedError when already rejected', () => {
    const p = makePayment({ status: 'rejected', reviewedBy: 'admin-1', reviewedAt: new Date() });
    expect(() => p.approve('admin-2')).toThrow(SubscriptionPaymentAlreadyResolvedError);
  });

  it('approve() error carries the correct code', () => {
    const p = makePayment({ status: 'approved', reviewedBy: 'admin-1', reviewedAt: new Date() });
    try {
      p.approve('admin-2');
    } catch (err) {
      expect((err as SubscriptionPaymentAlreadyResolvedError).code).toBe(
        'SUBSCRIPTION_PAYMENT_ALREADY_RESOLVED',
      );
    }
  });

  // ---------------------------------------------------------------------------
  // reject()
  // ---------------------------------------------------------------------------

  it('reject() transitions pending → rejected', () => {
    const p = makePayment();
    const rejected = p.reject('admin-1');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reviewedBy).toBe('admin-1');
    expect(rejected.reviewedAt).toBeInstanceOf(Date);
  });

  it('reject() does not mutate the original entity', () => {
    const p = makePayment();
    const rejected = p.reject('admin-1');
    expect(p.status).toBe('pending');
    expect(rejected.status).toBe('rejected');
  });

  it('reject() throws SubscriptionPaymentAlreadyResolvedError when already rejected', () => {
    const p = makePayment({ status: 'rejected', reviewedBy: 'admin-1', reviewedAt: new Date() });
    expect(() => p.reject('admin-2')).toThrow(SubscriptionPaymentAlreadyResolvedError);
  });

  it('reject() throws SubscriptionPaymentAlreadyResolvedError when already approved', () => {
    const p = makePayment({ status: 'approved', reviewedBy: 'admin-1', reviewedAt: new Date() });
    expect(() => p.reject('admin-2')).toThrow(SubscriptionPaymentAlreadyResolvedError);
  });
});
