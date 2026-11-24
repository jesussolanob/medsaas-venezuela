/**
 * Google Cloud IAM identity token cache.
 *
 * Fetches OIDC identity tokens from the GCP metadata server
 * (available inside Cloud Run / GCE instances). Tokens are cached
 * per audience until 5 minutes before their expiry.
 *
 * Local environments without a metadata server will get a network error,
 * which the caller propagates as a 502 to Zernio (safe fail-closed).
 */

const METADATA_BASE =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

/** Refresh 5 min before expiry to avoid using a just-expired token. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;
/** Fallback TTL when the JWT exp claim cannot be parsed. */
const FALLBACK_TTL_MS = 50 * 60 * 1000;

interface CachedEntry {
  token: string;
  expMs: number;
}

const cache = new Map<string, CachedEntry>();

/**
 * Returns a valid Google OIDC identity token for the given audience,
 * using a module-level cache keyed by audience URL.
 */
export async function getIdToken(audience: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(audience);
  if (cached && cached.expMs - REFRESH_SKEW_MS > now) {
    return cached.token;
  }

  const res = await fetch(`${METADATA_BASE}?audience=${encodeURIComponent(audience)}`, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    throw new Error(`Metadata server responded with ${res.status}`);
  }

  const token = (await res.text()).trim();

  // Parse expiry from JWT payload (base64url-encoded second segment).
  let expMs = now + FALLBACK_TTL_MS;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const raw = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
      const payload = JSON.parse(raw) as { exp?: unknown };
      if (typeof payload.exp === 'number') {
        expMs = payload.exp * 1000;
      }
    }
  } catch {
    // Non-decodable JWT — use fallback TTL.
  }

  cache.set(audience, { token, expMs });
  return token;
}
