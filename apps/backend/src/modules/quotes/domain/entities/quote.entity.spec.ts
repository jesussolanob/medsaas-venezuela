import { Quote } from './quote.entity';
import { QuoteItem } from './quote-item.entity';
import { QuoteShareLink } from './quote-share-link.entity';

const now = new Date('2026-09-01T00:00:00Z');
const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';

function makeQuote(overrides: Partial<Parameters<typeof Quote.create>[0]> = {}): Quote {
  return Quote.create({
    id: 'qqqqqqqq-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    quoteNumber: 'COT-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'draft',
    validUntil: null,
    notes: '',
    subtotalUsd: 100,
    discountUsd: 0,
    totalUsd: 100,
    bcvRate: null,
    totalBs: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

// ─── §9-1: Recipient XOR constraint ────────────────────────────────────────

describe('Quote.hasValidRecipient', () => {
  /**
   * §9-1a: patient_id AND lead_id both set → rejected.
   */
  it('§9-1a rejects quote with both patient_id and lead_id', () => {
    expect(Quote.hasValidRecipient(PATIENT_ID, LEAD_ID)).toBe(false);
  });

  /**
   * §9-1b: neither patient_id nor lead_id → rejected.
   */
  it('§9-1b rejects quote without any recipient', () => {
    expect(Quote.hasValidRecipient(null, null)).toBe(false);
  });

  it('accepts quote with only patient_id', () => {
    expect(Quote.hasValidRecipient(PATIENT_ID, null)).toBe(true);
  });

  it('accepts quote with only lead_id', () => {
    expect(Quote.hasValidRecipient(null, LEAD_ID)).toBe(true);
  });
});

// ─── §9-6: totalUsd = Σ amount_usd − discount_usd ──────────────────────────

describe('Quote.computeTotals', () => {
  /**
   * §9-6: totalUsd = Σ(amount_usd) − discount_usd, computed by the backend.
   */
  it('§9-6 computes subtotalUsd and totalUsd correctly', () => {
    const items = [{ amountUsd: 50 }, { amountUsd: 30 }, { amountUsd: 20 }];
    const { subtotalUsd, totalUsd } = Quote.computeTotals(items, 10);
    expect(subtotalUsd).toBe(100);
    expect(totalUsd).toBe(90);
  });

  it('clamps totalUsd to zero when discount exceeds subtotal', () => {
    const items = [{ amountUsd: 50 }];
    const { totalUsd } = Quote.computeTotals(items, 100);
    expect(totalUsd).toBe(0);
  });

  it('returns zero subtotal and total for empty items', () => {
    const { subtotalUsd, totalUsd } = Quote.computeTotals([], 0);
    expect(subtotalUsd).toBe(0);
    expect(totalUsd).toBe(0);
  });
});

// ─── Business invariants ────────────────────────────────────────────────────

describe('Quote domain invariants', () => {
  it('canBeEdited returns true for draft status', () => {
    const q = makeQuote({ status: 'draft' });
    expect(q.canBeEdited()).toBe(true);
  });

  it('canBeEdited returns false for sent status', () => {
    const q = makeQuote({ status: 'sent' });
    expect(q.canBeEdited()).toBe(false);
  });

  it('canBeSent returns true for draft status', () => {
    const q = makeQuote({ status: 'draft' });
    expect(q.canBeSent()).toBe(true);
  });

  it('canBeSent returns false for sent status', () => {
    const q = makeQuote({ status: 'sent' });
    expect(q.canBeSent()).toBe(false);
  });

  it('isOwnedBy returns true for the owning doctor', () => {
    const q = makeQuote();
    expect(q.isOwnedBy(DOCTOR_ID)).toBe(true);
  });

  it('isOwnedBy returns false for a different doctor', () => {
    const q = makeQuote();
    expect(q.isOwnedBy('eeeeeeee-0000-0000-0000-000000000002')).toBe(false);
  });
});

// ─── QuoteItem entity ────────────────────────────────────────────────────────

describe('QuoteItem.create', () => {
  it('computes amountUsd as quantity × unitPriceUsd', () => {
    const item = QuoteItem.create({
      id: 'iiiiiiii-0000-0000-0000-000000000001',
      quoteId: 'qqqqqqqq-0000-0000-0000-000000000001',
      doctorId: DOCTOR_ID,
      kind: 'product',
      sourceId: null,
      name: 'Crema A',
      description: '',
      quantity: 3,
      unitPriceUsd: 10.5,
      sortOrder: 0,
    });
    expect(item.amountUsd).toBeCloseTo(31.5);
  });

  it('round-trips through fromPersisted without recalculating', () => {
    const persisted = QuoteItem.fromPersisted({
      id: 'iiiiiiii-0000-0000-0000-000000000001',
      quoteId: 'qqqqqqqq-0000-0000-0000-000000000001',
      doctorId: DOCTOR_ID,
      kind: 'service',
      sourceId: null,
      name: 'Consulta',
      description: '',
      quantity: 1,
      unitPriceUsd: 80,
      amountUsd: 80, // already stored
      sortOrder: 0,
    });
    expect(persisted.amountUsd).toBe(80);
  });
});

// ─── QuoteShareLink entity ───────────────────────────────────────────────────

describe('QuoteShareLink', () => {
  function makeLink(expiresAt: Date, revokedAt: Date | null = null): QuoteShareLink {
    return QuoteShareLink.create({
      id: 'ssssssss-0000-0000-0000-000000000001',
      quoteId: 'qqqqqqqq-0000-0000-0000-000000000001',
      token: 'abc123',
      expiresAt,
      createdAt: now,
      revokedAt,
    });
  }

  it('isValid returns true when not expired and not revoked', () => {
    const future = new Date(now.getTime() + 86_400_000);
    const link = makeLink(future);
    expect(link.isValid(now)).toBe(true);
  });

  /**
   * §9-4a: expired token returns false.
   */
  it('§9-4a isValid returns false when expiresAt is in the past', () => {
    const past = new Date(now.getTime() - 1);
    const link = makeLink(past);
    expect(link.isValid(now)).toBe(false);
    expect(link.isExpired(now)).toBe(true);
  });

  it('isValid returns false when revokedAt is set (even if not expired)', () => {
    const future = new Date(now.getTime() + 86_400_000);
    const link = makeLink(future, new Date());
    expect(link.isValid(now)).toBe(false);
  });
});
