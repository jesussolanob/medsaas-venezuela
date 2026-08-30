import { SellerPayment } from './seller-payment.entity';

describe('SellerPayment entity', () => {
  it('stores all constructor fields correctly', () => {
    const paidAt = new Date('2026-08-28');
    const createdAt = new Date('2026-08-28');

    const payment = new SellerPayment(
      'pay-1',
      'seller-1',
      30,
      'Zelle',
      'REF-001',
      'https://example.com/receipt.jpg',
      'Pago de agosto',
      paidAt,
      'admin-1',
      createdAt,
      36.5,
    );

    expect(payment.id).toBe('pay-1');
    expect(payment.sellerId).toBe('seller-1');
    expect(payment.amountUsd).toBe(30);
    expect(payment.method).toBe('Zelle');
    expect(payment.reference).toBe('REF-001');
    expect(payment.receiptUrl).toBe('https://example.com/receipt.jpg');
    expect(payment.notes).toBe('Pago de agosto');
    expect(payment.paidAt).toBe(paidAt);
    expect(payment.createdBy).toBe('admin-1');
    expect(payment.createdAt).toBe(createdAt);
    expect(payment.bcvRate).toBe(36.5);
  });

  it('accepts null for optional fields including bcvRate', () => {
    const payment = new SellerPayment(
      'pay-2',
      'seller-1',
      10,
      'Transferencia',
      'REF-002',
      null,
      null,
      new Date(),
      'admin-1',
      new Date(),
      null,
    );

    expect(payment.receiptUrl).toBeNull();
    expect(payment.notes).toBeNull();
    expect(payment.bcvRate).toBeNull();
  });
});
