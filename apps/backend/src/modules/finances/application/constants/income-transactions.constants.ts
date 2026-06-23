/**
 * Pagination constants for the income-transactions list endpoint.
 *
 * Both the default and the ceiling are intentionally the same value (200).
 * Finance charts render up to one month of data; 200 rows is more than enough
 * for any production doctor's workload and keeps the payload predictable.
 */
export const INCOME_TX_DEFAULT_LIMIT = 200;
export const INCOME_TX_MAX_LIMIT = 200;
