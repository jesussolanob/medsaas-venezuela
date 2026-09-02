/**
 * QuoteItem domain entity — immutable snapshot of a quoted line.
 *
 * 🔴 Invariant: name, description, and unit_price_usd are ALWAYS copied from the
 * catalog at creation time. Updating the catalog never changes a QuoteItem.
 * source_id is informational only (the product/service may be deactivated later).
 *
 * amount_usd MUST equal quantity × unit_price_usd. The backend always computes it;
 * the value from the client is ignored for this field.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type QuoteItemKind = 'service' | 'product';

export interface QuoteItemCreateParams {
  id: string;
  quoteId: string;
  doctorId: string;
  kind: QuoteItemKind;
  sourceId: string | null;
  name: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  amountUsd: number;
  sortOrder: number;
}

export class QuoteItem {
  readonly id: string;
  readonly quoteId: string;
  readonly doctorId: string;
  readonly kind: QuoteItemKind;
  /** Reference to the originating catalog entry. No FK — may become stale. */
  readonly sourceId: string | null;
  readonly name: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceUsd: number;
  /** Always = quantity × unitPriceUsd. Never trusted from external input. */
  readonly amountUsd: number;
  readonly sortOrder: number;

  constructor(params: QuoteItemCreateParams) {
    this.id = params.id;
    this.quoteId = params.quoteId;
    this.doctorId = params.doctorId;
    this.kind = params.kind;
    this.sourceId = params.sourceId;
    this.name = params.name;
    this.description = params.description;
    this.quantity = params.quantity;
    this.unitPriceUsd = params.unitPriceUsd;
    this.amountUsd = params.amountUsd;
    this.sortOrder = params.sortOrder;
  }

  /**
   * Factory — computes amountUsd from quantity × unitPriceUsd.
   * The caller must NOT pass amountUsd from client input.
   */
  static create(params: Omit<QuoteItemCreateParams, 'amountUsd'>): QuoteItem {
    const amountUsd = Math.round(params.quantity * params.unitPriceUsd * 100) / 100;
    return new QuoteItem({ ...params, amountUsd });
  }

  /** Factory used for reconstruction from DB (amountUsd already computed). */
  static fromPersisted(params: QuoteItemCreateParams): QuoteItem {
    return new QuoteItem(params);
  }
}
