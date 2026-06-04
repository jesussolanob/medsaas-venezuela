import type { Promotion } from '../entities/promotion.entity';

export const PROMOTION_REPOSITORY = 'PROMOTION_REPOSITORY';

export interface PromotionCreateParams {
  planKey: string;
  durationMonths: number;
  originalPriceUsd: number;
  promoPriceUsd: number;
  label: string | null;
  isActive: boolean;
  endsAt: Date | null;
}

export interface PromotionUpdateParams {
  planKey?: string;
  durationMonths?: number;
  originalPriceUsd?: number;
  promoPriceUsd?: number;
  label?: string | null;
  isActive?: boolean;
  endsAt?: Date | null;
}

/**
 * Contract for promotion persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface IPromotionRepository {
  /**
   * Returns all promotions regardless of status.
   * Sorted by created_at DESC.
   */
  listAll(): Promise<Promotion[]>;

  /**
   * Returns only active promotions that are not expired.
   * Condition: is_active = true AND (ends_at IS NULL OR ends_at > now())
   * Sorted by plan_key ASC.
   */
  listActive(): Promise<Promotion[]>;

  /**
   * Finds a promotion by its ID.
   * Returns null when not found.
   */
  findById(id: string): Promise<Promotion | null>;

  /** Persists a new promotion. Returns the saved entity. */
  create(params: PromotionCreateParams): Promise<Promotion>;

  /**
   * Partially updates an existing promotion.
   * Only the provided fields are written; others remain unchanged.
   * Throws PromotionNotFoundError if the ID does not exist.
   */
  update(id: string, fields: PromotionUpdateParams): Promise<Promotion>;

  /**
   * Deletes a promotion by ID.
   * Throws PromotionNotFoundError if not found.
   */
  delete(id: string): Promise<void>;
}
