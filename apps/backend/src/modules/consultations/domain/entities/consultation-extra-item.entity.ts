/**
 * Domain entity representing one additional service line item attached to a
 * consultation payment.
 *
 * Extra items are created atomically during payment approval (replace-all
 * semantics: all previous items for the consultation are deleted and the new
 * list is inserted inside the same transaction).
 *
 * Invariants enforced in the constructor:
 *   - description must be a non-empty string (UI validation layer mirrors this).
 *   - amountUsd must be a finite positive number.
 *
 * This entity is pure domain: no NestJS / Sequelize imports.
 */
export interface ConsultationExtraItemCreateParams {
  id: string;
  consultationId: string;
  doctorId: string;
  description: string;
  amountUsd: number;
  createdAt: Date;
  /**
   * When set, this extra item is linked to an inventory product sale.
   * NULL for free-text service extras (e.g. "Limpieza dental").
   */
  productId?: string | null;
  /** Quantity sold. Defaults to 1 for service extras. */
  quantity?: number | null;
  /**
   * Unit price in USD at the moment of sale (before multiplying by quantity).
   * NULL for service extras.
   */
  unitPriceUsd?: number | null;
}

export class ConsultationExtraItem {
  readonly id: string;
  readonly consultationId: string;
  readonly doctorId: string;
  readonly description: string;
  readonly amountUsd: number;
  readonly createdAt: Date;
  readonly productId: string | null;
  readonly quantity: number;
  readonly unitPriceUsd: number | null;

  constructor(params: ConsultationExtraItemCreateParams) {
    if (!params.description || params.description.trim().length === 0) {
      throw new Error('ConsultationExtraItem: description must not be empty');
    }
    if (!Number.isFinite(params.amountUsd) || params.amountUsd <= 0) {
      throw new Error('ConsultationExtraItem: amountUsd must be a positive finite number');
    }

    this.id = params.id;
    this.consultationId = params.consultationId;
    this.doctorId = params.doctorId;
    this.description = params.description.trim();
    this.amountUsd = params.amountUsd;
    this.createdAt = params.createdAt;
    this.productId = params.productId ?? null;
    this.quantity = params.quantity ?? 1;
    this.unitPriceUsd = params.unitPriceUsd ?? null;
  }

  static create(params: ConsultationExtraItemCreateParams): ConsultationExtraItem {
    return new ConsultationExtraItem(params);
  }
}
