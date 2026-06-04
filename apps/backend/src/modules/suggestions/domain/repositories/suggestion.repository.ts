import type { Suggestion, SuggestionStatus } from '../entities/suggestion.entity';

export const SUGGESTION_REPOSITORY = 'SUGGESTION_REPOSITORY';

export interface SuggestionListAllFilters {
  status?: SuggestionStatus;
}

/**
 * Contract for suggestion persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface ISuggestionRepository {
  /**
   * Returns all suggestions for a given doctorId.
   * Sorted by created_at DESC (most recent first).
   */
  listForDoctor(doctorId: string): Promise<Suggestion[]>;

  /**
   * Returns all suggestions across all doctors, optionally filtered by status.
   * Sorted by created_at DESC (most recent first).
   */
  listAll(filters: SuggestionListAllFilters): Promise<Suggestion[]>;

  /**
   * Finds a suggestion by ID.
   * Returns null when the ID does not exist.
   */
  findById(id: string): Promise<Suggestion | null>;

  /** Persists a new suggestion. Returns the saved entity. */
  create(suggestion: Suggestion): Promise<Suggestion>;

  /**
   * Persists changes to an existing suggestion.
   * Returns the updated entity.
   */
  save(suggestion: Suggestion): Promise<Suggestion>;
}
