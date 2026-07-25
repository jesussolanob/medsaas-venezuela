import 'server-only';

/**
 * lib/identity.server.ts
 *
 * Unified server-side identity resolver — SERVER ONLY.
 *
 * Returns { id, role } regardless of AUTH_MODE, so api-client.server.ts
 * can attach the correct x-dev-user-id / x-dev-user-role headers.
 *
 * AUTH_MODE=dev   → reads dev_user_id / dev_user_role cookies (dev-stub).
 * AUTH_MODE=auth0 → reads Auth0 session, extracts email + sub + role claim,
 *                   calls backend POST /api/auth/resolve-identity to trade
 *                   the Auth0 identity for a profile UUID. The result is
 *                   deduplicated within a single request via React.cache().
 *
 * The id forwarded to the backend is ALWAYS the profile UUID, never the
 * Auth0 sub. This keeps the backend API surface identical between modes.
 */

import { cache } from 'react';
import type { DevUser } from './dev-auth';

export interface ResolvedIdentity {
  id: string;
  role: string;
}

/**
 * Thrown when there is no authenticated session (anonymous request, or an
 * expired/absent Auth0 token). This is an EXPECTED condition — the BFF layer
 * translates it into a clean 401, NOT an unhandled 500. Keeping it as a
 * distinct type lets callers tell "no session" apart from genuine failures
 * (missing secret, resolve-identity 5xx), which must still surface to Sentry.
 */
export class UnauthenticatedError extends Error {
  constructor(message = 'No authenticated session') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

// ---------------------------------------------------------------------------
// Resolve identity for dev mode
// ---------------------------------------------------------------------------

async function resolveDevIdentity(): Promise<ResolvedIdentity> {
  const { getDevUser } = await import('./dev-auth');
  const user: DevUser = await getDevUser();
  return { id: user.id, role: user.role };
}

// ---------------------------------------------------------------------------
// Resolve identity for Auth0 mode
// ---------------------------------------------------------------------------

interface ResolveIdentityResponse {
  id: string;
  role: string;
}

// React.cache() scopes the memoization to the current request (Server Component
// render tree). Each request gets its own cache entry — no cross-request leakage.
const resolveAuth0Identity = cache(async (): Promise<ResolvedIdentity> => {
  const { auth0 } = await import('./auth0');
  const session = await auth0.getSession();

  if (!session?.user) {
    throw new UnauthenticatedError(
      '[identity] No Auth0 session found — unauthenticated request reached BFF.',
    );
  }

  const { email, sub, name } = session.user;
  const roleNamespace = process.env.AUTH0_ROLE_NAMESPACE ?? 'https://deltamedical.app';
  const roleFromClaim = (session.user[`${roleNamespace}/role`] as string | undefined) ?? 'doctor';

  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';
  const resolveSecret = process.env.AUTH_RESOLVE_SECRET;
  if (!resolveSecret) {
    throw new Error('[identity] AUTH_RESOLVE_SECRET is not set.');
  }

  const res = await fetch(`${backendUrl}/api/auth/resolve-identity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-auth-secret': resolveSecret,
    },
    body: JSON.stringify({
      email,
      sub,
      role: roleFromClaim,
      fullName: name ?? email ?? 'Unknown',
    }),
    // Do not cache across requests — identity must always be fresh.
    cache: 'no-store',
  });

  if (!res.ok) {
    // Do NOT include the response body — it may echo PII (e.g. the email in a 422).
    throw new Error(`[identity] resolve-identity failed (${res.status})`);
  }

  const body = (await res.json()) as { data?: ResolveIdentityResponse } & ResolveIdentityResponse;
  // Support both { id, role } and { data: { id, role } } envelopes.
  const resolved: ResolvedIdentity = {
    id: body.data?.id ?? body.id,
    role: body.data?.role ?? body.role,
  };

  return resolved;
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reviewer access identity (Etapa 2 · Google OAuth review).
 *
 * A reviewer session carries a reviewer_token cookie but NO Auth0 session, so
 * resolveAuth0Identity() would throw UnauthenticatedError and every BFF data
 * call would 401 (empty sidebar, fallback plan). When the feature flag is on and
 * a valid reviewer_token is present, resolve the identity straight from the
 * token's sub with the fixed demo role ('doctor'). The backend still validates
 * the token via x-reviewer-token (forwarded by instrumentation.ts), so this is
 * plumbing only — no trust is placed in the unverified client cookie.
 *
 * Returns null (→ fall through to Auth0) for every normal user: they have no
 * reviewer_token cookie, or the flag is off.
 */
async function resolveReviewerIdentity(): Promise<ResolvedIdentity | null> {
  if (process.env.REVIEWER_ACCESS_ENABLED !== 'true') return null;
  const { getReviewerSub } = await import('./reviewer-token.server');
  const sub = await getReviewerSub();
  if (!sub) return null;
  return { id: sub, role: 'doctor' };
}

/**
 * Resolves the current user's identity based on AUTH_MODE.
 * Returns { id, role } where id is always the backend profile UUID.
 */
export async function resolveIdentity(): Promise<ResolvedIdentity> {
  const authMode = process.env.AUTH_MODE ?? 'dev';

  if (authMode === 'auth0') {
    // ORDEN CRÍTICO: una sesión real de Auth0 SIEMPRE gana sobre la cookie de
    // reviewer. Al revés, un reviewer_token sobrante (dura 12h) secuestraba la
    // identidad de un usuario autenticado y le servía el perfil del doctor demo.
    // El reviewer no tiene sesión de Auth0, así que cae al fallback de abajo.
    try {
      return await resolveAuth0Identity();
    } catch (error: unknown) {
      if (error instanceof UnauthenticatedError) {
        const reviewer = await resolveReviewerIdentity();
        if (reviewer) return reviewer;
      }
      throw error;
    }
  }

  // Default: dev-stub (safe fallback even if AUTH_MODE is undefined or empty).
  return resolveDevIdentity();
}
