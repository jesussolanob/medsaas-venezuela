/**
 * lib/auth-guards.ts
 *
 * RBAC helpers for API route handlers. Identity is resolved via
 * resolveIdentity() (lib/identity.server.ts), which works in both auth modes.
 *
 * AUTH_MODE=dev   → identity from dev cookies (x-dev-user-id / x-dev-user-role).
 * AUTH_MODE=auth0 → identity from the Auth0 session (resolve-identity → profile UUID).
 *   When there is no Auth0 session, resolveIdentity() throws and requireRole()
 *   fails closed with a 401.
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
import { resolveIdentity } from '@/lib/identity.server';
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
export async function requireRole(allowed: UserRole[], forbiddenMessage?: string): Promise<Guard> {
  // resolveIdentity() resolves per AUTH_MODE: dev cookies (never throws) or the
  // Auth0 session. In auth0 mode it THROWS when there is no session, so we fail
  // closed with a 401 instead of leaking a fallback identity.
  let identity: { id: string; role: string };
  try {
    identity = await resolveIdentity();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }),
    };
  }

  if (!identity.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }),
    };
  }

  if (!(allowed as string[]).includes(identity.role)) {
    return {
      ok: false,
      // Este texto se pinta tal cual en la UI (modales de admin, toasts): español.
      response: NextResponse.json(
        { error: forbiddenMessage ?? 'No tenés permisos para realizar esta acción.' },
        { status: 403 },
      ),
    };
  }

  const profile: ProfileMin = {
    id: identity.id,
    role: identity.role as UserRole,
    email: null,
  };

  return {
    ok: true,
    user: { id: identity.id, email: null },
    profile,
  };
}

/**
 * Requires authentication + role super_admin.
 *
 * El mensaje del 403 nombra la causa más frecuente y no es teoría: el 2026-08-18
 * la sesión del navegador cambió a la de un especialista (otra pestaña, misma
 * ventana) y la pantalla de admin abierta empezó a recibir 403 en cada acción.
 * Un "no tenés permisos" a secas se lee como un rol mal configurado.
 */
export async function requireSuperAdmin(): Promise<Guard> {
  return requireRole(
    ['super_admin'],
    'Tu sesión no tiene permisos de administrador. Si iniciaste sesión con otra cuenta en esta ventana, cerrá sesión y volvé a entrar.',
  );
}

/** Requires authentication of any role. */
export async function requireAuth(): Promise<Guard> {
  return requireRole(['super_admin', 'doctor', 'assistant', 'patient']);
}
