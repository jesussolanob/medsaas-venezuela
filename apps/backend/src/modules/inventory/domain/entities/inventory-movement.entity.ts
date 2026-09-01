/**
 * InventoryMovement domain entity — one row in the stock ledger.
 *
 * qty convention (always with sign):
 *   + (positive) → stock enters    (purchase, adjustment credit)
 *   - (negative) → stock leaves    (sale, loss, adjustment debit)
 *
 * kind values: 'purchase' | 'sale' | 'adjustment' | 'loss'
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type MovementKind = 'purchase' | 'sale' | 'adjustment' | 'loss';

export interface InventoryMovementCreateParams {
  id: string;
  doctorId: string;
  productId: string;
  kind: MovementKind;
  /** Signed quantity: positive enters, negative exits. Must not be 0. */
  qty: number;
  /** Populated for sales; null for manual adjustments. */
  unitPriceUsd: number | null;
  /** Exchange rate used when product price was in VES. */
  rateUsed: number | null;
  /** Source of the rate: 'bcv' | 'binance' | 'manual'. */
  rateSource: string | null;
  /** Consultation that originated this sale. Null for manual movements. */
  consultationId: string | null;
  note: string | null;
  createdAt: Date;
}

export class InventoryMovement {
  readonly id: string;
  readonly doctorId: string;
  readonly productId: string;
  readonly kind: MovementKind;
  readonly qty: number;
  readonly unitPriceUsd: number | null;
  readonly rateUsed: number | null;
  readonly rateSource: string | null;
  readonly consultationId: string | null;
  readonly note: string | null;
  readonly createdAt: Date;

  constructor(params: InventoryMovementCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.productId = params.productId;
    this.kind = params.kind;
    this.qty = params.qty;
    this.unitPriceUsd = params.unitPriceUsd;
    this.rateUsed = params.rateUsed;
    this.rateSource = params.rateSource;
    this.consultationId = params.consultationId;
    this.note = params.note;
    this.createdAt = params.createdAt;
  }

  /** Returns true when this movement is a consultation sale. */
  isSale(): boolean {
    return this.kind === 'sale';
  }

  static create(params: InventoryMovementCreateParams): InventoryMovement {
    return new InventoryMovement(params);
  }
}
