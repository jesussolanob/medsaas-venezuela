/**
 * lib/dev-auth.ts
 *
 * STUB Etapa 1 — reemplazar por Auth0 en Fase 4.
 *
 * Provee la identidad del usuario actualmente autenticado para ser adjuntada
 * como headers `x-dev-user-id` y `x-dev-user-role` en llamadas al backend
 * NestJS (DevAuthGuard), y para la verificación de rutas en el middleware.
 *
 * En Etapa 2 (Auth0) este módulo se elimina y se reemplaza por
 * `lib/auth.server.ts` que verifica el JWT de Auth0 desde una httpOnly cookie.
 *
 * EXPORTA DOS FUNCIONES:
 *   - getDevUser()          — usa next/headers (cookies()); para Server Actions y
 *                             Route Handlers.
 *   - getDevUserFromRequest() — acepta RequestCookies de NextRequest; para middleware
 *                             (Edge Runtime, no puede usar next/headers).
 *
 * NO importar desde componentes cliente ('use client').
 */

import type { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { cookies } from 'next/headers';

export type DevUserRole = 'doctor' | 'super_admin' | 'patient';

export interface DevUser {
  id: string;
  role: DevUserRole;
}

/**
 * UUID v4 fijo para el doctor de desarrollo.
 *
 * E2E: sembrar un profile con este id en la base de datos antes de probar:
 *   INSERT INTO profiles (id, full_name, role, email)
 *   VALUES ('00000000-0000-4000-8000-000000000001', 'Dr. Dev', 'doctor', 'dev@dev.local');
 *
 * Para usar un doctor real, setear la cookie dev_user_id=<uuid real del doctor>.
 */
export const DEV_DOCTOR_UUID = '00000000-0000-4000-8000-000000000001';

const DEFAULT_USER_ROLE: DevUserRole = 'doctor';

function isValidRole(value: string | null | undefined): value is DevUserRole {
  return value === 'doctor' || value === 'super_admin' || value === 'patient';
}

function resolveFromRaw(
  rawId: string | null | undefined,
  rawRole: string | null | undefined,
): DevUser {
  const id = rawId && rawId.trim().length > 0 ? rawId.trim() : DEV_DOCTOR_UUID;
  const role = isValidRole(rawRole) ? rawRole : DEFAULT_USER_ROLE;
  return { id, role };
}

/**
 * Returns the dev user identity from Server Action / Route Handler context.
 * Uses next/headers cookies() — NOT compatible with Edge Runtime (middleware).
 *
 * Cookies read:
 *   dev_user_id   — UUID of the acting user
 *   dev_user_role — 'doctor' | 'super_admin' | 'patient'
 */
export async function getDevUser(): Promise<DevUser> {
  const cookieStore = await cookies();
  return resolveFromRaw(
    cookieStore.get('dev_user_id')?.value,
    cookieStore.get('dev_user_role')?.value,
  );
}

/**
 * Returns the dev user identity from a NextRequest's cookies.
 * Safe to call in Edge Runtime (middleware) — does NOT import next/headers.
 *
 * @param requestCookies — the `cookies` property of a NextRequest object.
 */
export function getDevUserFromRequest(requestCookies: RequestCookies): DevUser {
  return resolveFromRaw(
    requestCookies.get('dev_user_id')?.value,
    requestCookies.get('dev_user_role')?.value,
  );
}
