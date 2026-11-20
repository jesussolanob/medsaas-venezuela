/**
 * Parses the raw value of the `admin_notification_extra_emails` app_settings key.
 *
 * Rules:
 *   - Splits on comma, semicolon, or newline (any combination).
 *   - Trims surrounding whitespace from each token.
 *   - Lowercases each token.
 *   - Drops tokens that do not match a basic `local@domain.tld` pattern.
 *   - Deduplicates (case-insensitively — duplicates are already prevented by
 *     the lowercase step, but the Set guards against the raw values having
 *     different casing if this function is ever called with pre-split tokens).
 *
 * Returns an empty array when rawValue is falsy or contains no valid addresses.
 *
 * SECURITY: callers must NEVER log the returned email addresses (PII).
 *           Log counts only.
 */

/** Minimal email pattern — not RFC 5322, but good enough to drop garbage. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAdminExtraEmails(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of rawValue.split(/[,;\n]+/)) {
    const email = token.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }

  return result;
}
