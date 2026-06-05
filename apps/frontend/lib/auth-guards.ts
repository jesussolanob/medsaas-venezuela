/**
 * lib/auth-guards.ts
 *
 * RBAC helpers for API route handlers. Replaces Supabase Auth with the
 * dev-stub identity (getDevUser) from lib/dev-auth.ts.
 *
 * ETAPA 1: Auth resolved from dev cookies (x-dev-user-id / x-dev-user-role).
 * ETAPA 2 (Auth0): Replace getDevUser() with Auth0 JWT verification. The rest
 *   of this module stays the same — callers are not affected.
 *
 * Breaking change vs. previous version: the `admin` field (Supabase client)
 * is no longer returned. Route handlers that need to query data should use
 * backendGet / backendPost from lib/api-client.server.ts, or — for Supabase-
 * only features pending backend migration — import createAdminClient locally
 * and annotate with // FASE 5/6: pendiente backend.
 *
 * Usage in a route handler:
 *
 *   import { requireSuperAdmin } from '@/lib/auth-guards'
 *
 *   export async function GET() {
 *     const guard = await requireSuperAdmin()
 *     if (!guard.ok) return guard.response
 *     const { user, profile } = guard
 *     // ...
 *   }
 */

import { NextResponse } from 'next/server';
import { getDevUser } from '@/lib/dev-auth';
import type { DevUserRole } from '@/lib/dev-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = DevUserRole | 'assistant';

interface ProfileMin {
  id: string;
  role: UserRole;
  email: null; // email is not available in the dev-stub; always null in Etapa 1
}

type GuardOk = { ok: true; user: { id: string; email: null }; profile: ProfileMin };
type GuardFail = { ok: false; response: NextResponse };
type Guard = GuardOk | GuardFail;

// ---------------------------------------------------------------------------
// Core guard
// ---------------------------------------------------------------------------

/**
 * Verifies identity from the dev-stub and checks that the caller's role is
 * one of the allowed roles.
 *
 * Returns:
 *   - { ok: false, response } with 401 when no identity is found.
 *   - { ok: false, response } with 403 when the role is not allowed.
 *   - { ok: true, user, profile } on success.
 *
 * NOTE: `user.email` and `profile.email` are always null in Etapa 1 because
 * the dev-stub does not store email. Auth0 (Etapa 2) will populate them.
 */
export async function requireRole(allowed: UserRole[]): Promise<Guard> {
  const devUser = await getDevUser();

  // In the dev-stub, getDevUser() always returns a fallback identity — there
  // is no "unauthenticated" state. This branch exists so the API surface is
  // ready for Etapa 2 where getDevUser() can return null / throw.
  if (!devUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }),
    };
  }

  if (!(allowed as string[]).includes(devUser.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const profile: ProfileMin = {
    id: devUser.id,
    role: devUser.role,
    email: null,
  };

  return {
    ok: true,
    user: { id: devUser.id, email: null },
    profile,
  };
}

/** Requires authentication + role super_admin. */
export async function requireSuperAdmin(): Promise<Guard> {
  return requireRole(['super_admin']);
}

/** Requires authentication of any role. */
export async function requireAuth(): Promise<Guard> {
  return requireRole(['super_admin', 'doctor', 'assistant', 'patient']);
}
