/**
 * Repository port for persisting and querying historical BCV rates.
 * Lives in domain/ — no Sequelize or external-library imports.
 */
export const BCV_RATE_HISTORY_REPOSITORY = 'BCV_RATE_HISTORY_REPOSITORY';

export interface BcvRateHistoryEntry {
  /** ISO date string YYYY-MM-DD */
  rateDate: string;
  rate: number;
  source: string | null;
}

export interface IBcvRateHistoryRepository {
  /**
   * Returns the cached rate for a calendar day, or null when not cached.
   * @param date ISO date string YYYY-MM-DD
   */
  findByDate(date: string): Promise<BcvRateHistoryEntry | null>;

  /**
   * Persists a rate entry. Idempotent — if a row for the date already exists
   * the implementation may skip or upsert without error.
   */
  save(entry: BcvRateHistoryEntry): Promise<void>;
}
