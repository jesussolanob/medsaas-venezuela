// Prevents this module from being imported in 'use client' components or the
// Edge Runtime. Only `dev-auth.edge.ts` (no Node imports) is safe for Edge.
import 'server-only';

/**
 * lib/dev-auth.ts
 *
 * STUB Etapa 1 — reemplazar por Auth0 en Fase 4.
 *
 * Server-side entry point. Uses next/headers (cookies()) — requires Node
 * runtime. NOT safe for Edge Runtime (proxy.ts / middleware).
 *
 * For Edge Runtime use lib/dev-auth.edge.ts → getDevUserFromRequest().
 *
 * En Etapa 2 (Auth0): este módulo se elimina y se reemplaza por
 * `lib/auth.server.ts` que verifica el JWT de Auth0 desde una httpOnly cookie.
 */

import { cookies } from 'next/headers';
export type { DevUser, DevUserRole } from './dev-auth.edge';
export { DEV_DOCTOR_UUID, resolveFromRaw, getDevUserFromRequest } from './dev-auth.edge';

/**
 * Returns the dev user identity from Server Action / Route Handler context.
 * Uses next/headers cookies() — NOT compatible with Edge Runtime.
 *
 * Cookies read:
 *   dev_user_id   — UUID of the acting user
 *   dev_user_role — 'doctor' | 'super_admin' | 'patient'
 */
export async function getDevUser(): Promise<import('./dev-auth.edge').DevUser> {
  const { resolveFromRaw: resolve } = await import('./dev-auth.edge');
  const cookieStore = await cookies();
  return resolve(cookieStore.get('dev_user_id')?.value, cookieStore.get('dev_user_role')?.value);
}
