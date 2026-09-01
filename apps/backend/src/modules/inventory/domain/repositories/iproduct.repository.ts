import type { Product } from '../entities/product.entity';
import type { InventoryMovement } from '../entities/inventory-movement.entity';

export const PRODUCT_REPOSITORY = 'PRODUCT_REPOSITORY';

export interface ProductListFilters {
  doctorId: string;
  search?: string;
  active?: boolean;
  page: number;
  limit: number;
}

export interface ProductListResult {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export interface MovementListResult {
  items: InventoryMovement[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductUpdateFields {
  name?: string;
  description?: string;
  supplier?: string | null;
  photoPath?: string | null;
  salePriceAmount?: number;
  salePriceCurrency?: 'USD' | 'VES';
  lowStockThreshold?: number | null;
}

/**
 * Contract for product and inventory-movement persistence.
 *
 * The application layer depends only on this interface — never on the Sequelize
 * implementation — to keep the domain layer infrastructure-free.
 *
 * Movement operations are included here to avoid proliferating small repository
 * interfaces for a tightly coupled ledger.
 */
export interface IProductRepository {
  // --------------------------------------------------------------------------
  // Products
  // --------------------------------------------------------------------------

  /** Paginated list filtered by doctorId, optional search and active flag. */
  list(filters: ProductListFilters): Promise<ProductListResult>;

  /**
   * Finds a product by ID scoped to doctorId.
   * Returns null when ID does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Product | null>;

  /** Persists a new product. Returns the saved entity. */
  save(product: Product): Promise<Product>;

  /**
   * Partial update scoped to (id, doctorId).
   * Only the provided fields are written; others remain unchanged.
   * Throws ProductNotFoundError when the product is not found or not owned.
   */
  update(id: string, doctorId: string, fields: ProductUpdateFields): Promise<Product>;

  /**
   * Soft-deletes a product (sets is_active = false).
   * Throws ProductNotFoundError when not found or not owned.
   */
  deactivate(id: string, doctorId: string): Promise<void>;

  // --------------------------------------------------------------------------
  // Inventory movements
  // --------------------------------------------------------------------------

  /** Paginated movements for a specific product scoped to doctorId. */
  listMovements(
    productId: string,
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<MovementListResult>;

  /** Persists a new movement. Does NOT update stock_qty (use applyMovement). */
  saveMovement(movement: InventoryMovement): Promise<InventoryMovement>;

  /**
   * Persists a movement AND atomically updates the product's stock_qty by
   * the movement's qty (positive = add, negative = subtract).
   *
   * Business rule: stock can go negative (spec §decisions: avisa, no bloquea).
   */
  applyMovement(movement: InventoryMovement): Promise<InventoryMovement>;

  /**
   * Returns all sale movements linked to a specific consultation, scoped to doctorId.
   * Used by SyncConsultationSaleMovementsUseCase to revert/reapply stock changes.
   */
  findSalesByConsultation(consultationId: string, doctorId: string): Promise<InventoryMovement[]>;

  /**
   * Deletes all sale movements for the given consultationId + doctorId and
   * returns the quantities to be restored per productId.
   *
   * Atomically restores stock_qty for each affected product (stock += abs(qty)).
   */
  revertSalesByConsultation(consultationId: string, doctorId: string): Promise<void>;
}
