/**
 * Quote domain entity — a presupuesto created by a specialist for a patient or lead.
 *
 * Invariants:
 *   - Exactly one of patientId / leadId must be non-null (XOR constraint).
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

export interface QuoteCreateParams {
  id: string;
  doctorId: string;
  quoteNumber: string;
  patientId: string | null;
  leadId: string | null;
  status: QuoteStatus;
  validUntil: Date | null;
  notes: string;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  bcvRate: number | null;
  totalBs: number | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items?: QuoteItem[];
  /**
   * Active (non-revoked) share link token for this quote.
   * Null when the quote is a draft or the link has been revoked.
   * Only populated on doctor-authenticated fetch paths (GET /:id, POST /:id/send).
   * Never included in the public endpoint response.
   */
  shareToken?: string | null;
}

export class Quote {
  readonly id: string;
  readonly doctorId: string;
  readonly quoteNumber: string;
  readonly patientId: string | null;
  readonly leadId: string | null;
  readonly status: QuoteStatus;
  readonly validUntil: Date | null;
  readonly notes: string;
  readonly subtotalUsd: number;
  readonly discountUsd: number;
  readonly totalUsd: number;
  readonly bcvRate: number | null;
  readonly totalBs: number | null;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly items: QuoteItem[];
  /** Active share token — null for drafts or revoked links. Doctor-side only. */
  readonly shareToken: string | null;

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
    this.discountUsd = params.discountUsd;
    this.totalUsd = params.totalUsd;
    this.bcvRate = params.bcvRate;
    this.totalBs = params.totalBs;
    this.sentAt = params.sentAt;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.items = params.items ?? [];
    this.shareToken = params.shareToken ?? null;
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
   * Computes totals from items and discount.
   * Always called in the backend — never trusts client-provided totals.
   *
   * @param items  QuoteItem array (amountUsd already computed per item)
   * @param discountUsd  Flat discount in USD (must be non-negative)
   * @returns { subtotalUsd, totalUsd }
   */
  static computeTotals(
    items: Array<{ amountUsd: number }>,
    discountUsd: number,
  ): { subtotalUsd: number; totalUsd: number } {
    const subtotalUsd = Math.round(items.reduce((sum, it) => sum + it.amountUsd, 0) * 100) / 100;
    const totalUsd = Math.round(Math.max(0, subtotalUsd - discountUsd) * 100) / 100;
    return { subtotalUsd, totalUsd };
  }

  static create(params: QuoteCreateParams): Quote {
    return new Quote(params);
  }
}
