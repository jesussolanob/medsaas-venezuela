/**
 * Quote domain entity — a presupuesto created by a specialist for a patient or lead.
 *
 * Invariants:
 *   - Exactly one of patientId / leadId must be non-null (XOR constraint).
 *   - discountUsd is ALWAYS derived from (discountType, discountValue): never
 *     trusted directly from the client. See computeDiscount().
 *   - totalUsd = Σ(items.amountUsd) − discountUsd (computed by the backend).
 *   - bcvRate and totalBs are frozen at send time, never recalculated afterward.
 *   - isOwnedBy() enforces anti-IDOR — same 404 for missing and foreign quotes.
 *   - canBeEdited() → only draft quotes accept changes.
 *   - canBeSent() → draft quotes with at least one item and a recipient.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

import { QuoteItem } from './quote-item.entity';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

/**
 * 'amount'  → discountValue is a flat USD amount (e.g. 30 = $30).
 * 'percent' → discountValue is a percentage of the subtotal (e.g. 30 = 30%),
 *             clamped to 0..100 by computeDiscount().
 */
export type QuoteDiscountType = 'amount' | 'percent';

export interface QuoteCreateParams {
  id: string;
  doctorId: string;
  quoteNumber: string;
  patientId: string | null;
  leadId: string | null;
  status: QuoteStatus;
  /**
   * ⚠️ `Date | string` a propósito, y no `Date`: al LEER de la base esto es una
   * cadena 'YYYY-MM-DD' (columna DATEONLY), al ESCRIBIR llega un Date desde el
   * DTO. Declararlo solo `Date` es lo que hizo que el cron de vencimiento no
   * venciera nada. Para comparar, usá {@link Quote.expiresAt}.
   */
  validUntil: Date | string | null;
  notes: string;
  subtotalUsd: number;
  /** What the specialist typed — 30 = $30 for 'amount', 30 = 30% for 'percent'. */
  discountType: QuoteDiscountType;
  discountValue: number;
  /** Always derived from (discountType, discountValue) — see computeDiscount(). */
  discountUsd: number;
  totalUsd: number;
  bcvRate: number | null;
  totalBs: number | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Timestamp when the "about to expire" reminder was sent (or attempted —
   * see DispatchQuoteExpiryNoticesUseCase). Null means it has not been
   * dispatched yet. Stamped even when the recipient has no email on file, so
   * the sweep never retries the same quote forever.
   */
  expiryReminderSentAt?: Date | null;
  items?: QuoteItem[];
  /**
   * Active (non-revoked) share link token for this quote.
   * Null when the quote is a draft or the link has been revoked.
   * Only populated on doctor-authenticated fetch paths (GET /:id, POST /:id/send).
   * Never included in the public endpoint response.
   */
  shareToken?: string | null;
  /**
   * Display name of whoever the quote is addressed to — the patient's decrypted
   * full name, or the prospect's name when the quote points at a lead.
   *
   * Read-model field, like `shareToken`: it does not live in the `quotes` table
   * and is resolved by the use case for list/detail views. Null when it was not
   * resolved (write paths) or when the referenced patient/lead no longer exists.
   */
  recipientName?: string | null;
}

export class Quote {
  readonly id: string;
  readonly doctorId: string;
  readonly quoteNumber: string;
  readonly patientId: string | null;
  readonly leadId: string | null;
  readonly status: QuoteStatus;
  /** Ver la nota de `QuoteProps.validUntil`: al leer es una cadena. */
  readonly validUntil: Date | string | null;
  readonly notes: string;
  readonly subtotalUsd: number;
  readonly discountType: QuoteDiscountType;
  readonly discountValue: number;
  readonly discountUsd: number;
  readonly totalUsd: number;
  readonly bcvRate: number | null;
  readonly totalBs: number | null;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** See QuoteCreateParams.expiryReminderSentAt. */
  readonly expiryReminderSentAt: Date | null;
  readonly items: QuoteItem[];
  /** Active share token — null for drafts or revoked links. Doctor-side only. */
  readonly shareToken: string | null;
  /** Patient/prospect display name. Read-model — see QuoteCreateParams. */
  readonly recipientName: string | null;

  constructor(params: QuoteCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.quoteNumber = params.quoteNumber;
    this.patientId = params.patientId;
    this.leadId = params.leadId;
    this.status = params.status;
    this.validUntil = params.validUntil;
    this.notes = params.notes;
    this.subtotalUsd = params.subtotalUsd;
    this.discountType = params.discountType;
    this.discountValue = params.discountValue;
    this.discountUsd = params.discountUsd;
    this.totalUsd = params.totalUsd;
    this.bcvRate = params.bcvRate;
    this.totalBs = params.totalBs;
    this.sentAt = params.sentAt;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.expiryReminderSentAt = params.expiryReminderSentAt ?? null;
    this.items = params.items ?? [];
    this.shareToken = params.shareToken ?? null;
    this.recipientName = params.recipientName ?? null;
  }

  /**
   * Returns a copy carrying the resolved recipient name. Used by the list/detail
   * use cases, which resolve the name after the repository has already built the
   * entity. Immutable — never mutates the original.
   */
  withRecipientName(recipientName: string | null): Quote {
    return new Quote({ ...this, recipientName });
  }

  /** Anti-IDOR: returns false for foreign doctor IDs. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Only draft quotes can be edited or deleted. */
  canBeEdited(): boolean {
    return this.status === 'draft';
  }

  /** Only draft quotes can be sent. */
  canBeSent(): boolean {
    return this.status === 'draft';
  }

  /**
   * True when this quote is a candidate for the "about to expire" reminder:
   * still 'sent' (never accepted/rejected/expired), has a validUntil date,
   * that date falls within [now, now + windowDays] inclusive, and the
   * reminder has not already been dispatched.
   *
   * Kept as a domain predicate (not buried in repository SQL or use-case
   * date arithmetic) so DispatchQuoteExpiryNoticesUseCase can defensively
   * re-check every candidate the repository returns, the same way
   * isOwnedBy() double-checks ownership instead of trusting the caller.
   */
  isDueForExpiryReminder(now: Date, windowDays: number): boolean {
    if (this.status !== 'sent') return false;
    if (this.expiryReminderSentAt !== null) return false;
    const corte = this.expiresAt();
    if (corte === null) return false;
    // El fin de la ventana también se lleva al FIN de su día: si no, un
    // presupuesto que vence el último día de la ventana quedaba afuera por unas
    // horas (su corte son las 23:59 de ese día; `now + 3 días` es la hora en que
    // corrió el cron). La regla se piensa en días calendario de las dos puntas.
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    windowEnd.setUTCHours(23, 59, 59, 999);
    return corte >= now && corte <= windowEnd;
  }

  /**
   * Instante EXACTO en que este presupuesto deja de valer, o null si no vence.
   *
   * ⚠️ NUNCA compares `validUntil` directamente contra un `Date`. El campo está
   * declarado `Date | null`, pero en tiempo de ejecución es una CADENA
   * 'YYYY-MM-DD': la columna es `DataType.DATEONLY` y Sequelize 6 la sanea con
   * `moment(value).format('YYYY-MM-DD')` (`data-types.js`, `DATEONLY._sanitize`).
   * El repositorio la pasa tal cual a la entidad, así que TypeScript da por buena
   * una anotación que no se corresponde con lo que hay en memoria.
   *
   * Comparar esa cadena con un `Date` no da un resultado "casi bien": da SIEMPRE
   * `false`. La comparación relacional convierte ambos lados a número y
   * `Number('2026-10-08')` es `NaN`, y toda comparación contra `NaN` es falsa.
   * Con la comparación cruda, nada vencía nunca y ningún aviso salía jamás — y
   * los tests no lo veían porque construyen la entidad con `Date` de verdad.
   *
   * El corte es el FIN del día (23:59:59.999 UTC), no su medianoche: es la misma
   * convención que ya usaba `SendQuoteUseCase.computeExpiresAt()` para el enlace
   * público, y la que se le promete al paciente cuando la pantalla dice "vence el
   * 8 de octubre" — vale todo ese día. Con la medianoche, el estado se habría
   * vencido casi un día antes que el enlace, y el paciente habría visto un
   * presupuesto vigente que el backend le rechazaba al aceptarlo.
   */
  /**
   * `valid_until` como día calendario 'YYYY-MM-DD', listo para serializar.
   *
   * Existe porque el controlador público hacía `validUntil?.toISOString()` y eso
   * LANZA: `?.` solo cubre null/undefined, y una cadena no tiene `toISOString`.
   * La página pública del presupuesto y su PDF —lo que abre el paciente desde el
   * correo— habrían dado 500 para cualquier presupuesto CON fecha de validez.
   *
   * No explotaba solo porque el campo "Válido hasta" arrancaba vacío y casi nadie
   * lo llenaba; al prellenarlo con 30 días, habría fallado en todos los nuevos.
   */
  validUntilAsDateString(): string | null {
    if (this.validUntil === null) return null;
    if (typeof this.validUntil === 'string') return this.validUntil.slice(0, 10);
    return this.validUntil.toISOString().slice(0, 10);
  }

  expiresAt(): Date | null {
    if (this.validUntil === null) return null;
    const d = new Date(this.validUntil as Date | string);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  /**
   * State machine guard for status transitions via UpdateQuoteStatusUseCase.
   *
   * Valid transitions (manual — not triggered by workflow actions):
   *   sent → accepted
   *   sent → rejected
   *   sent → expired
   *
   * A draft cannot jump directly to a terminal state — that would bypass rate
   * freezing and share-link creation, leaving bcvRate / totalBs as NULL on an
   * "accepted" quote.
   */
  canTransitionTo(target: QuoteStatus): boolean {
    const TERMINAL: ReadonlySet<QuoteStatus> = new Set(['accepted', 'rejected', 'expired']);
    return this.status === 'sent' && TERMINAL.has(target);
  }

  /**
   * Validates XOR recipient constraint:
   * Exactly one of patientId / leadId must be non-null.
   */
  static hasValidRecipient(patientId: string | null, leadId: string | null): boolean {
    return (patientId !== null) !== (leadId !== null);
  }

  /**
   * Computes discountUsd from the specialist's input.
   * Always called in the backend — never trusts a client-provided discountUsd.
   *
   *   amount  → min(discountValue, subtotalUsd) — never discounts more than the
   *             subtotal, and never negative.
   *   percent → round(subtotalUsd × clamp(discountValue, 0, 100) / 100, 2) — the
   *             percentage itself is clamped, not the resulting dollar amount
   *             (it is already ≤ subtotalUsd by construction).
   */
  static computeDiscount(
    subtotalUsd: number,
    discountType: QuoteDiscountType,
    discountValue: number,
  ): number {
    if (discountType === 'percent') {
      const clampedPercent = Math.min(100, Math.max(0, discountValue));
      return Math.round(((subtotalUsd * clampedPercent) / 100) * 100) / 100;
    }
    return Math.min(Math.max(0, discountValue), subtotalUsd);
  }

  /**
   * Computes subtotal, discount, and total from items and the specialist's
   * discount input. Always called in the backend — never trusts client-provided
   * totals.
   *
   * @param items  QuoteItem array (amountUsd already computed per item)
   * @param discountType   'amount' | 'percent'
   * @param discountValue  What the specialist typed — see QuoteDiscountType
   * @returns { subtotalUsd, discountUsd, totalUsd } — totalUsd is never negative.
   */
  static computeTotals(
    items: Array<{ amountUsd: number }>,
    discountType: QuoteDiscountType,
    discountValue: number,
  ): { subtotalUsd: number; discountUsd: number; totalUsd: number } {
    const subtotalUsd = Math.round(items.reduce((sum, it) => sum + it.amountUsd, 0) * 100) / 100;
    const discountUsd = this.computeDiscount(subtotalUsd, discountType, discountValue);
    const totalUsd = Math.round(Math.max(0, subtotalUsd - discountUsd) * 100) / 100;
    return { subtotalUsd, discountUsd, totalUsd };
  }

  static create(params: QuoteCreateParams): Quote {
    return new Quote(params);
  }
}
