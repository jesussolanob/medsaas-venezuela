/**
 * MppsVerificationPort — domain-level abstraction for querying an external
 * MPPS credential registry.
 *
 * Concrete implementations (e.g. SacsXajaxAdapter) live in infrastructure/.
 * Use cases depend only on this interface; the adapter is injected at runtime.
 *
 * SECURITY: implementations MUST NOT log cedula, full name, or MPPS numbers.
 */

export const MPPS_VERIFICATION_PORT = Symbol('IMppsVerificationPort');

export interface MppsProfessionEntry {
  licencia: string;
  profesion: string;
  fechaRegistro: string;
  tomoRegistro: string;
  folioRegistro: string;
}

export interface MppsVerificationResult {
  found: boolean;
  /** Normalized name from the registry — only set when found is true. */
  name?: string;
  professions?: MppsProfessionEntry[];
}

export interface IMppsVerificationPort {
  /**
   * Queries the external MPPS registry by cedula.
   *
   * @param cedula - The raw cedula value (e.g. "12345678").
   *   The adapter prepends the national prefix (V-/E-).
   * @returns Parsed result from the portal.
   * @throws Error subclass on network / parse failures.
   */
  queryByCedula(cedula: string): Promise<MppsVerificationResult>;
}
