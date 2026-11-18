/**
 * IDefaultSellerPort
 *
 * Abstracts two database operations needed to assign the system-configured
 * default seller to a newly registered specialist who arrived organically
 * (no seller code, no prior sold_by).
 *
 * Lives in the application layer of doctor-registration so CompleteRegistrationUseCase
 * stays decoupled from admin settings and seller infrastructure details.
 *
 * SECURITY: neither method accepts PII — only profile IDs are exchanged.
 */

export const DEFAULT_SELLER_PORT = Symbol('IDefaultSellerPort');

export interface IDefaultSellerPort {
  /**
   * Reads the 'default_seller_id' key from app_settings and validates that
   * the referenced profile:
   *   - exists in the profiles table
   *   - has role = 'seller'
   *   - has is_active = true
   *
   * Returns the UUID when valid; null in every other case:
   *   - setting not configured (key absent or empty)
   *   - profile not found
   *   - profile is inactive
   *   - profile has a different role
   *
   * Logs a WARN when the setting exists but points to an invalid/inactive seller
   * so operators can detect misconfiguration without needing to reproduce a
   * specific registration.
   */
  resolveDefaultSellerId(): Promise<string | null>;

  /**
   * Writes sold_by = sellerId and sold_by_source = 'admin' on the specialist
   * profile, but ONLY when sold_by IS currently NULL (write-once guarantee —
   * same invariant as ISellerRepository.linkSoldBy).
   *
   * When the UPDATE touches exactly 1 row, also inserts a row in
   * seller_attribution_logs with:
   *   - from_seller_id = NULL  (specialist had no prior seller)
   *   - to_seller_id   = sellerId
   *   - assigned_by    = NULL  (system-initiated, no human actor)
   *
   * When the UPDATE touches 0 rows (sold_by already set), skips the INSERT
   * — the idempotency guarantee means calling this multiple times is safe.
   *
   * Errors propagate to the caller. The use case wraps this in a fire-and-forget
   * block so a failure never aborts registration.
   */
  assignDefaultSeller(specialistId: string, sellerId: string): Promise<void>;
}
