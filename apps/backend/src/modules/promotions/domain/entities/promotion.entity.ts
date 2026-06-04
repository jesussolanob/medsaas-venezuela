import { InvalidPromotionError } from '../errors/invalid-promotion.error';

export interface PromotionCreateParams {
  id: string;
  planKey: string;
  durationMonths: number;
  originalPriceUsd: number;
  promoPriceUsd: number;
  label: string | null;
  isActive: boolean;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Promotion domain entity.
 *
 * Invariants enforced here (no imports from NestJS, Sequelize, or external libs):
 *   - promo_price_usd < original_price_usd (InvalidPromotionError if violated)
 *   - duration_months >= 1 (InvalidPromotionError if violated)
 */
export class Promotion {
  readonly id: string;
  readonly planKey: string;
  readonly durationMonths: number;
  readonly originalPriceUsd: number;
  readonly promoPriceUsd: number;
  readonly label: string | null;
  readonly isActive: boolean;
  readonly endsAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PromotionCreateParams) {
    this.id = params.id;
    this.planKey = params.planKey;
    this.durationMonths = params.durationMonths;
    this.originalPriceUsd = params.originalPriceUsd;
    this.promoPriceUsd = params.promoPriceUsd;
    this.label = params.label;
    this.isActive = params.isActive;
    this.endsAt = params.endsAt;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Validates business invariants for price and duration.
   * Throws InvalidPromotionError when any invariant is violated.
   */
  static validateInvariants(
    promoPriceUsd: number,
    originalPriceUsd: number,
    durationMonths: number,
  ): void {
    if (durationMonths < 1) {
      throw new InvalidPromotionError('duration_months must be at least 1');
    }
    if (promoPriceUsd >= originalPriceUsd) {
      throw new InvalidPromotionError('promo_price_usd must be less than original_price_usd');
    }
  }

  /** Factory — validates invariants and creates a Promotion. Does not persist. */
  static create(params: PromotionCreateParams): Promotion {
    Promotion.validateInvariants(
      params.promoPriceUsd,
      params.originalPriceUsd,
      params.durationMonths,
    );
    return new Promotion(params);
  }

  /** Returns a new Promotion with updated fields (immutable). Validates invariants. */
  withUpdates(fields: Partial<PromotionCreateParams>): Promotion {
    const next: PromotionCreateParams = {
      id: this.id,
      planKey: fields.planKey ?? this.planKey,
      durationMonths: fields.durationMonths ?? this.durationMonths,
      originalPriceUsd: fields.originalPriceUsd ?? this.originalPriceUsd,
      promoPriceUsd: fields.promoPriceUsd ?? this.promoPriceUsd,
      label: fields.label !== undefined ? fields.label : this.label,
      isActive: fields.isActive !== undefined ? fields.isActive : this.isActive,
      endsAt: fields.endsAt !== undefined ? fields.endsAt : this.endsAt,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    };
    Promotion.validateInvariants(next.promoPriceUsd, next.originalPriceUsd, next.durationMonths);
    return new Promotion(next);
  }

  private toParams(): PromotionCreateParams {
    return {
      id: this.id,
      planKey: this.planKey,
      durationMonths: this.durationMonths,
      originalPriceUsd: this.originalPriceUsd,
      promoPriceUsd: this.promoPriceUsd,
      label: this.label,
      isActive: this.isActive,
      endsAt: this.endsAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // Expose for immutable copies inside the entity itself
  asParams(): PromotionCreateParams {
    return this.toParams();
  }
}
