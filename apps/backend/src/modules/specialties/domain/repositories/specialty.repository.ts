import type { Specialty } from '../entities/specialty.entity';

export const SPECIALTY_REPOSITORY = Symbol('ISpecialtyRepository');

export interface CreateSpecialtyParams {
  name: string;
  sortOrder: number;
}

export interface UpdateSpecialtyParams {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ISpecialtyRepository {
  /**
   * Returns all active specialties ordered by sort_order ASC, name ASC.
   * Used by the public GET /api/specialties endpoint.
   */
  findAllActive(): Promise<Specialty[]>;

  /**
   * Finds a specialty by its primary key.
   * Returns null when not found.
   */
  findById(id: string): Promise<Specialty | null>;

  /**
   * Finds a specialty by exact name (case-sensitive).
   * Used for duplicate-name validation before create/update.
   */
  findByName(name: string): Promise<Specialty | null>;

  /**
   * Persists a new specialty.
   * Caller must verify uniqueness before calling (throws at DB level otherwise).
   */
  create(params: CreateSpecialtyParams): Promise<Specialty>;

  /**
   * Applies a partial update to an existing specialty.
   * Throws SpecialtyNotFoundError when the id does not exist.
   */
  update(id: string, params: UpdateSpecialtyParams): Promise<Specialty>;
}
