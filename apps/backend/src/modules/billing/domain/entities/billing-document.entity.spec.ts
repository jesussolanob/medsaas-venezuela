import { BillingDocument } from './billing-document.entity';

function makeDocument(overrides: Partial<Parameters<typeof BillingDocument.create>[0]> = {}) {
  return BillingDocument.create({
    id: 'doc-1',
    docNumber: 'FACTURA-20260101-0001',
    docType: 'factura',
    doctorId: 'dr-1',
    consultationId: null,
    paymentId: null,
    patientId: null,
    items: [{ description: 'Consulta', quantity: 1, unitPrice: 50, total: 50 }],
    subtotal: 50,
    total: 60,
    ivaAmount: 10,
    igtfAmount: 0,
    bcvRate: null,
    totalBs: null,
    notes: null,
    currency: 'USD',
    status: 'issued',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('BillingDocument entity', () => {
  it('creates a document with correct props', () => {
    const doc = makeDocument();
    expect(doc.id).toBe('doc-1');
    expect(doc.docType).toBe('factura');
    expect(doc.status).toBe('issued');
    expect(doc.total).toBe(60);
    expect(doc.ivaAmount).toBe(10);
  });

  it('exposes all getters correctly', () => {
    const doc = makeDocument();
    expect(doc.docNumber).toBe('FACTURA-20260101-0001');
    expect(doc.doctorId).toBe('dr-1');
    expect(doc.consultationId).toBeNull();
    expect(doc.currency).toBe('USD');
  });

  it('items getter returns a defensive copy', () => {
    const doc = makeDocument();
    const items = doc.items;
    items.push({ description: 'Extra', quantity: 1, unitPrice: 5, total: 5 });
    // Entity items should remain unchanged
    expect(doc.items).toHaveLength(1);
  });

  it('toPlain returns a copy with all props', () => {
    const doc = makeDocument();
    const plain = doc.toPlain();
    expect(plain.id).toBe('doc-1');
    // Mutating items in plain should not affect entity
    plain.items.push({ description: 'Extra', quantity: 1, unitPrice: 5, total: 5 });
    expect(doc.items).toHaveLength(1);
  });

  it('handles null optional fields', () => {
    const doc = makeDocument({
      bcvRate: null,
      totalBs: null,
      notes: null,
      subtotal: null,
    });
    expect(doc.bcvRate).toBeNull();
    expect(doc.totalBs).toBeNull();
    expect(doc.notes).toBeNull();
    expect(doc.subtotal).toBeNull();
  });

  it('handles numeric optional fields', () => {
    const doc = makeDocument({
      bcvRate: 36.5,
      totalBs: 2190,
      notes: 'Test note',
    });
    expect(doc.bcvRate).toBe(36.5);
    expect(doc.totalBs).toBe(2190);
    expect(doc.notes).toBe('Test note');
  });
});
