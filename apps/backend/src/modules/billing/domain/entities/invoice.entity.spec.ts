import { Invoice } from './invoice.entity';

function makeInvoice(overrides: Partial<Parameters<typeof Invoice.create>[0]> = {}) {
  return Invoice.create({
    id: 'inv-1',
    doctorId: 'doc-1',
    invoiceNumber: 'FAC-20260101-0001',
    amount: 100,
    currency: 'USD',
    description: 'Monthly subscription',
    status: 'issued',
    issuedAt: new Date('2026-01-01'),
    sentAt: null,
    paidAt: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('Invoice entity', () => {
  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  it('creates an invoice with issued status', () => {
    const inv = makeInvoice();
    expect(inv.id).toBe('inv-1');
    expect(inv.status).toBe('issued');
    expect(inv.paidAt).toBeNull();
  });

  it('exposes all getters correctly', () => {
    const inv = makeInvoice();
    expect(inv.doctorId).toBe('doc-1');
    expect(inv.invoiceNumber).toBe('FAC-20260101-0001');
    expect(inv.amount).toBe(100);
    expect(inv.currency).toBe('USD');
    expect(inv.description).toBe('Monthly subscription');
    expect(inv.createdBy).toBe('admin-1');
  });

  it('toPlain returns a copy with all props', () => {
    const inv = makeInvoice();
    const plain = inv.toPlain();
    expect(plain.id).toBe('inv-1');
    // Mutating plain must not affect entity
    plain.status = 'paid';
    expect(inv.status).toBe('issued');
  });

  // ---------------------------------------------------------------------------
  // markSent()
  // ---------------------------------------------------------------------------

  it('markSent() transitions issued → sent', () => {
    const inv = makeInvoice();
    const sent = inv.markSent();
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).toBeInstanceOf(Date);
  });

  it('markSent() does not mutate the original entity', () => {
    const inv = makeInvoice();
    const sent = inv.markSent();
    expect(inv.status).toBe('issued');
    expect(sent.status).toBe('sent');
  });

  it('markSent() is idempotent — preserves original sentAt', () => {
    const originalSentAt = new Date('2026-01-10');
    const inv = makeInvoice({ status: 'sent', sentAt: originalSentAt });
    const sent = inv.markSent();
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).toEqual(originalSentAt);
  });

  it('markSent() does not downgrade a paid invoice', () => {
    const inv = makeInvoice({ status: 'paid', paidAt: new Date('2026-01-15') });
    const sent = inv.markSent();
    expect(sent.status).toBe('paid');
  });

  // ---------------------------------------------------------------------------
  // markPaid()
  // ---------------------------------------------------------------------------

  it('markPaid() transitions issued → paid', () => {
    const inv = makeInvoice();
    const paid = inv.markPaid();
    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toBeInstanceOf(Date);
  });

  it('markPaid() does not mutate the original entity', () => {
    const inv = makeInvoice();
    const paid = inv.markPaid();
    expect(inv.status).toBe('issued');
    expect(paid.status).toBe('paid');
  });

  it('markPaid() is idempotent — preserves original paidAt', () => {
    const originalPaidAt = new Date('2026-01-15');
    const inv = makeInvoice({ status: 'paid', paidAt: originalPaidAt });
    const paid = inv.markPaid();
    expect(paid.status).toBe('paid');
    // Should keep the original paidAt, not override it
    expect(paid.paidAt).toEqual(originalPaidAt);
  });

  it('markPaid() sets a new paidAt when called on sent invoice', () => {
    const inv = makeInvoice({ status: 'sent', sentAt: new Date('2026-01-10') });
    const paid = inv.markPaid();
    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toBeInstanceOf(Date);
  });
});
