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
    quoteNumber: 'PRE-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'draft',
    validUntil: null,
    notes: '',
    subtotalUsd: 100,
    discountType: 'amount',
    discountValue: 0,
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
  it('§9-6 computes subtotalUsd, discountUsd and totalUsd correctly (amount)', () => {
    const items = [{ amountUsd: 50 }, { amountUsd: 30 }, { amountUsd: 20 }];
    const { subtotalUsd, discountUsd, totalUsd } = Quote.computeTotals(items, 'amount', 10);
    expect(subtotalUsd).toBe(100);
    expect(discountUsd).toBe(10);
    expect(totalUsd).toBe(90);
  });

  it('clamps totalUsd to zero when the amount discount exceeds subtotal', () => {
    const items = [{ amountUsd: 50 }];
    const { discountUsd, totalUsd } = Quote.computeTotals(items, 'amount', 100);
    expect(discountUsd).toBe(50);
    expect(totalUsd).toBe(0);
  });

  it('computes a percent discount as a share of the subtotal', () => {
    const items = [{ amountUsd: 200 }];
    const { subtotalUsd, discountUsd, totalUsd } = Quote.computeTotals(items, 'percent', 30);
    expect(subtotalUsd).toBe(200);
    expect(discountUsd).toBe(60);
    expect(totalUsd).toBe(140);
  });

  it('clamps a percent discount above 100 to 100%', () => {
    const items = [{ amountUsd: 80 }];
    const { discountUsd, totalUsd } = Quote.computeTotals(items, 'percent', 150);
    expect(discountUsd).toBe(80);
    expect(totalUsd).toBe(0);
  });

  it('clamps a negative percent discount to 0%', () => {
    const items = [{ amountUsd: 80 }];
    const { discountUsd, totalUsd } = Quote.computeTotals(items, 'percent', -20);
    expect(discountUsd).toBe(0);
    expect(totalUsd).toBe(80);
  });

  it('returns zero subtotal, discount, and total for empty items', () => {
    const { subtotalUsd, discountUsd, totalUsd } = Quote.computeTotals([], 'amount', 0);
    expect(subtotalUsd).toBe(0);
    expect(discountUsd).toBe(0);
    expect(totalUsd).toBe(0);
  });
});

describe('Quote.computeDiscount', () => {
  it('amount: never exceeds the subtotal', () => {
    expect(Quote.computeDiscount(50, 'amount', 100)).toBe(50);
  });

  it('amount: never negative', () => {
    expect(Quote.computeDiscount(50, 'amount', -10)).toBe(0);
  });

  it('percent: rounds to 2 decimals', () => {
    expect(Quote.computeDiscount(99.99, 'percent', 33)).toBeCloseTo(33.0, 2);
  });

  it('percent: 0% yields zero discount', () => {
    expect(Quote.computeDiscount(100, 'percent', 0)).toBe(0);
  });

  it('percent: 100% discounts the full subtotal', () => {
    expect(Quote.computeDiscount(150, 'percent', 100)).toBe(150);
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

// ─── Quote.isDueForExpiryReminder ───────────────────────────────────────────

describe('Quote.isDueForExpiryReminder', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('returns false when status is not sent', () => {
    const q = makeQuote({ status: 'draft', validUntil: new Date(now.getTime() + DAY) });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(false);
  });

  it('returns false for accepted quotes even with an overdue validUntil', () => {
    const q = makeQuote({ status: 'accepted', validUntil: new Date(now.getTime() - DAY) });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(false);
  });

  it('returns false when validUntil is null', () => {
    const q = makeQuote({ status: 'sent', validUntil: null });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(false);
  });

  it('returns false when expiryReminderSentAt is already set (idempotency)', () => {
    const q = makeQuote({
      status: 'sent',
      validUntil: new Date(now.getTime() + 2 * DAY),
      expiryReminderSentAt: now,
    });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(false);
  });

  it('returns true when validUntil falls within the window (inclusive lower bound)', () => {
    const q = makeQuote({ status: 'sent', validUntil: now });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(true);
  });

  it('returns true when validUntil falls within the window (inclusive upper bound)', () => {
    const q = makeQuote({ status: 'sent', validUntil: new Date(now.getTime() + 3 * DAY) });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(true);
  });

  it('returns false when validUntil is more than windowDays away', () => {
    const q = makeQuote({ status: 'sent', validUntil: new Date(now.getTime() + 10 * DAY) });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(false);
  });

  it('returns false when validUntil is already in the past (handled by the expiry sweep instead)', () => {
    const q = makeQuote({ status: 'sent', validUntil: new Date(now.getTime() - DAY) });
    expect(q.isDueForExpiryReminder(now, 3)).toBe(false);
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

// ─── El tipo de validUntil MIENTE: en memoria es una cadena ──────────────────
//
// La columna es DataType.DATEONLY y Sequelize 6 la sanea con
// moment(v).format('YYYY-MM-DD') — devuelve un STRING, no un Date, aunque el
// modelo y la entidad lo declaren `Date | null`.
//
// Todos los demás tests de este archivo construyen la entidad con `new Date()`,
// así que ninguno reproduce lo que llega de la base. Estos sí: pasan la cadena
// CRUDA, tal cual sale del driver.
//
// Sin esto, el cron de vencimiento era un no-op silencioso en producción con la
// suite entera en verde: comparar 'YYYY-MM-DD' contra un Date convierte ambos
// lados a número, Number('2026-10-08') es NaN, y toda comparación contra NaN es
// falsa. No vencía nada y no salía ningún aviso.
describe('Quote con validUntil tal como lo devuelve Sequelize (cadena DATEONLY)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  /** Formatea como lo hace DATEONLY._sanitize: 'YYYY-MM-DD'. */
  function comoDateonly(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  /** El cast reproduce la mentira del tipo: en runtime acá llega una cadena. */
  function quoteConCadena(fecha: string, extra = {}): Quote {
    return makeQuote({ validUntil: fecha as unknown as Date, status: 'sent', ...extra });
  }

  it('expiresAt() interpreta la cadena y devuelve el FIN del día, no su medianoche', () => {
    const q = quoteConCadena('2026-10-08');
    const corte = q.expiresAt();
    expect(corte).not.toBeNull();
    expect(corte?.toISOString()).toBe('2026-10-08T23:59:59.999Z');
  });

  it('detecta como vencida una cadena de ayer (antes daba SIEMPRE false)', () => {
    const ayer = comoDateonly(new Date(now.getTime() - DAY));
    const corte = quoteConCadena(ayer).expiresAt();
    expect(corte).not.toBeNull();
    expect((corte as Date) < now).toBe(true);
  });

  it('sigue vigente todo el día que promete la pantalla', () => {
    // Vence hoy: a cualquier hora de hoy TODAVÍA vale — es lo que se le dijo al
    // paciente ("vence el 8 de octubre") y lo que ya hacía el enlace público.
    const hoy = comoDateonly(now);
    const corte = quoteConCadena(hoy).expiresAt();
    expect((corte as Date) < now).toBe(false);
  });

  it('dispara el aviso cuando faltan 2 días, con la fecha como cadena', () => {
    const en2dias = comoDateonly(new Date(now.getTime() + 2 * DAY));
    expect(quoteConCadena(en2dias).isDueForExpiryReminder(now, 3)).toBe(true);
  });

  it('no dispara el aviso cuando faltan 10 días', () => {
    const en10dias = comoDateonly(new Date(now.getTime() + 10 * DAY));
    expect(quoteConCadena(en10dias).isDueForExpiryReminder(now, 3)).toBe(false);
  });

  it('expiresAt() devuelve null ante una fecha impresentable, sin explotar', () => {
    expect(quoteConCadena('no-es-una-fecha').expiresAt()).toBeNull();
  });
});

// ─── validUntilAsDateString: el 500 de la pagina publica ─────────────────────
describe('Quote.validUntilAsDateString', () => {
  it('serializa la CADENA que devuelve la base sin lanzar', () => {
    // Antes, el controlador publico hacia `validUntil?.toISOString()`. El `?.`
    // solo cubre null, y una cadena NO tiene toISOString: la pagina publica del
    // presupuesto y su PDF —lo que abre el paciente desde el correo— devolvian
    // 500 para cualquier presupuesto CON fecha de validez.
    const q = makeQuote({ validUntil: '2026-10-08' as unknown as Date });
    expect(q.validUntilAsDateString()).toBe('2026-10-08');
  });

  it('tambien acepta un Date, que es lo que llega al escribir', () => {
    const q = makeQuote({ validUntil: new Date('2026-10-08T00:00:00.000Z') });
    expect(q.validUntilAsDateString()).toBe('2026-10-08');
  });

  it('devuelve null cuando el presupuesto no vence', () => {
    expect(makeQuote({ validUntil: null }).validUntilAsDateString()).toBeNull();
  });
});
