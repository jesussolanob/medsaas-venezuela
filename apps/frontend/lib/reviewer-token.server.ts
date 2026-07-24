import 'server-only';

/**
 * lib/reviewer-token.server.ts
 *
 * Server-only helper that reads the reviewer_token httpOnly cookie for the
 * current request. Used by instrumentation.ts to forward the token to the
 * backend as x-reviewer-token.
 *
 * Memoized per request via React.cache() so multiple backend calls in the
 * same render tree read the cookie store only once.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';

export const getReviewerToken = cache(async (): Promise<string | null> => {
  try {
    const store = await cookies();
    return store.get('reviewer_token')?.value ?? null;
  } catch {
    // No request context (e.g. static generation) — no reviewer token.
    return null;
  }
});

/**
 * Decodes the `sub` (demo profile UUID) from the reviewer_token payload WITHOUT
 * verifying the HMAC — the backend independently verifies the token via
 * x-reviewer-token, so a forged cookie only yields a sub the backend rejects.
 *
 * Used by identity.server.ts so a reviewer session (which has NO Auth0 session)
 * still resolves a backend identity and reaches authenticated BFF endpoints.
 * Returns null when there is no token, the payload is malformed, or it expired.
 */
export const getReviewerSub = cache(async (): Promise<string | null> => {
  const token = await getReviewerToken();
  if (!token) return null;
  try {
    const payloadB64 = token.split('.')[0];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!payload.sub) return null;
    // Reject an expired token so we never present a stale identity.
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
});
