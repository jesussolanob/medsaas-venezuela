import 'server-only';

/**
 * lib/auth0-token.server.ts
 *
 * Returns the raw Auth0 ID token for the CURRENT request, or null.
 *
 * The token is forwarded to the IAM-protected NestJS backend as the
 * `x-auth0-token` header (see instrumentation.ts), where the backend's
 * Auth0Guard (AUTH_MODE=auth0) validates it (iss/aud/exp, RS256) and resolves
 * the caller's profile from the email claim.
 *
 * Returns null when:
 *   - AUTH_MODE !== 'auth0'      → dev-stub mode, no Auth0 involved.
 *   - there is no Auth0 session  → unauthenticated request (e.g. @Public route).
 *   - no request context / SDK error → fail closed (the backend returns 401 for
 *     protected routes; @Public routes don't need the header).
 *
 * Memoized per request via React.cache() so several backend calls in a single
 * render/action decrypt the session cookie only once.
 */
import { cache } from 'react';

export const getAuth0IdToken = cache(async (): Promise<string | null> => {
  if ((process.env.AUTH_MODE ?? 'dev') !== 'auth0') return null;

  try {
    const { auth0 } = await import('./auth0');
    const session = await auth0.getSession();
    return session?.tokenSet?.idToken ?? null;
  } catch {
    // No request context, no session, or SDK error → no token.
    return null;
  }
});
