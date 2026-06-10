/**
 * GET /api/debug/whoami — identity/role diagnostic (safe, owner-scoped).
 *
 * Returns the CURRENT user's role as seen from the two sources that must agree:
 *   - claimRole    → the role the MIDDLEWARE trusts (Auth0 ID-token claim in
 *                    auth0 mode, or the dev_user_role cookie in dev mode).
 *   - resolvedRole → the role the BACKEND uses (profile.role from the DB, via
 *                    resolveIdentity → /api/auth/resolve-identity).
 *
 * When `roleMatches` is false, the Auth0 Action is not propagating
 * app_metadata.role to the ID token under AUTH0_ROLE_NAMESPACE (or the
 * namespaces differ). This is the canonical check for "why am I not admin".
 *
 * Safe to keep: it only ever returns the caller's OWN id/role (no patient PII,
 * no other users). Unauthenticated callers get nulls + errors, never data.
 */
import { NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/identity.server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const authMode = process.env.AUTH_MODE ?? 'dev';
  const body: Record<string, unknown> = { authMode };

  // 1. Role from the source the middleware trusts.
  try {
    if (authMode === 'auth0') {
      const { auth0 } = await import('@/lib/auth0');
      const session = await auth0.getSession();
      const ns = process.env.AUTH0_ROLE_NAMESPACE ?? 'https://deltamedical.app';
      body.hasSession = Boolean(session?.user);
      body.roleNamespace = ns;
      body.claimRole = (session?.user?.[`${ns}/role`] as string | undefined) ?? null;
    } else {
      const { cookies } = await import('next/headers');
      const store = await cookies();
      body.hasSession = Boolean(store.get('dev_user_id')?.value);
      body.claimRole = store.get('dev_user_role')?.value ?? null;
    }
  } catch (err: unknown) {
    body.claimError = err instanceof Error ? err.message : 'unknown';
  }

  // 2. Role the backend uses (DB profile.role).
  try {
    const identity = await resolveIdentity();
    body.resolvedId = identity.id;
    body.resolvedRole = identity.role;
  } catch (err: unknown) {
    body.resolveError = err instanceof Error ? err.message : 'unknown';
  }

  body.roleMatches = body.claimRole != null && body.claimRole === body.resolvedRole;

  return NextResponse.json(body);
}
