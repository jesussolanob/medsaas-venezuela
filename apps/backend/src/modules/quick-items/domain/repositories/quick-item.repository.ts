import type { QuickItem, QuickItemType } from '../entities/quick-item.entity';

export const QUICK_ITEM_REPOSITORY = 'QUICK_ITEM_REPOSITORY';

/**
 * Contract for quick item persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface IQuickItemRepository {
  /**
   * Returns all quick items for a given doctorId.
   * Optionally filtered by itemType.
   * Ordered by created_at ASC.
   */
  listByDoctor(doctorId: string, itemType?: QuickItemType): Promise<QuickItem[]>;

  /**
   * Finds a quick item by ID scoped to doctorId.
   * Returns null when the ID does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<QuickItem | null>;

  /** Persists a new quick item. Returns the saved entity. */
  create(item: QuickItem): Promise<QuickItem>;

  /**
   * Deletes a quick item scoped to (id, doctorId).
   * Throws QuickItemNotFoundError if not found or owned by another doctor.
   */
  delete(id: string, doctorId: string): Promise<void>;
}
