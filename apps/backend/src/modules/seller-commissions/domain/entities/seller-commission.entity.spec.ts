import { SellerCommission } from './seller-commission.entity';

const makeCommission = (status: 'pending' | 'paid' = 'pending') =>
  new SellerCommission(
    'comm-1',
    'seller-1',
    'spec-1',
    'signup',
    10,
    null,
    status,
    new Date('2026-08-28'),
    status === 'paid' ? 'pay-1' : null,
    new Date('2026-08-28'),
  );

describe('SellerCommission entity', () => {
  it('isPending returns true for pending status', () => {
    expect(makeCommission('pending').isPending()).toBe(true);
  });

  it('isPending returns false for paid status', () => {
    expect(makeCommission('paid').isPending()).toBe(false);
  });

  it('isPaid returns true for paid status', () => {
    expect(makeCommission('paid').isPaid()).toBe(true);
  });

  it('isPaid returns false for pending status', () => {
    expect(makeCommission('pending').isPaid()).toBe(false);
  });

  it('stores all constructor fields correctly', () => {
    const comm = makeCommission('pending');
    expect(comm.id).toBe('comm-1');
    expect(comm.sellerId).toBe('seller-1');
    expect(comm.specialistId).toBe('spec-1');
    expect(comm.type).toBe('signup');
    expect(comm.amountUsd).toBe(10);
    expect(comm.planKey).toBeNull();
    expect(comm.paymentId).toBeNull();
  });

  it('stores planKey for plan type commission', () => {
    const planComm = new SellerCommission(
      'comm-2',
      'seller-1',
      'spec-1',
      'plan',
      20,
      'delta_plus',
      'pending',
      new Date(),
      null,
      new Date(),
    );
    expect(planComm.planKey).toBe('delta_plus');
    expect(planComm.type).toBe('plan');
    expect(planComm.amountUsd).toBe(20);
  });
});
