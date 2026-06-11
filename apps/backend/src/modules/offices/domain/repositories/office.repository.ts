import type { Office } from '../entities/office.entity';

export const OFFICE_REPOSITORY = 'OFFICE_REPOSITORY';

/**
 * Contract for office persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface IOfficeRepository {
  /**
   * Returns all offices for a given doctorId.
   * Sorted by created_at ASC (oldest first, consistent ordering for UI).
   */
  listByDoctor(doctorId: string): Promise<Office[]>;

  /**
   * Finds an office by ID scoped to doctorId.
   * Returns null when the ID does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Office | null>;

  /**
   * Returns all ACTIVE offices for a given doctorId.
   * Used by the booking slot generation logic.
   */
  findActiveByDoctor(doctorId: string): Promise<Office[]>;

  /**
   * Finds a single office by ID (any doctor).
   * Used by the booking flow to validate modality before creating a booking.
   * Returns null if not found.
   */
  findById(id: string): Promise<Office | null>;

  /** Persists a new office. Returns the saved entity. */
  create(office: Office): Promise<Office>;

  /**
   * Fully replaces an existing office's mutable fields.
   * Scoped to (id, doctorId) — silently ignores cross-doctor attempts.
   */
  save(office: Office): Promise<Office>;

  /** Deletes an office scoped to (id, doctorId). Throws OfficeNotFoundError if not found. */
  delete(id: string, doctorId: string): Promise<void>;
}
