/**
 * lib/dev-auth.edge.ts
 *
 * STUB Etapa 1 — reemplazar por Auth0 en Fase 4.
 *
 * Subconjunto de dev-auth.ts seguro para Edge Runtime (proxy.ts / middleware).
 * No importa `next/headers` ni ningún módulo Node.js, por lo que puede ejecutarse
 * tanto en el Edge Runtime como en el runtime normal de Node.
 *
 * Contiene:
 *   - Tipos compartidos (DevUser, DevUserRole)
 *   - Constante DEV_DOCTOR_UUID
 *   - getDevUserFromRequest() — lee identidad desde RequestCookies del NextRequest
 *
 * En Etapa 2 (Auth0): reemplazar por verificación del JWT en la httpOnly cookie.
 */

import type { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';

export type DevUserRole = 'doctor' | 'super_admin' | 'patient';

export interface DevUser {
  id: string;
  role: DevUserRole;
}

/**
 * UUID v4 fijo para el doctor de desarrollo.
 *
 * E2E: sembrar un profile con este id antes de probar end-to-end:
 *   INSERT INTO profiles (id, full_name, role, email)
 *   VALUES ('00000000-0000-4000-8000-000000000001', 'Dr. Dev', 'doctor', 'dev@delta.local');
 *
 * Para usar un doctor real, setear la cookie dev_user_id=<uuid real del doctor>.
 */
export const DEV_DOCTOR_UUID = '00000000-0000-4000-8000-000000000001';

/**
 * UUID v4 fijo para el paciente de desarrollo (auth_user_id).
 *
 * El portal del paciente (backend) deriva el scope de `user.sub` (auth_user_id),
 * NO del path. Para probar el portal end-to-end, setear las cookies:
 *   dev_user_id=00000000-0000-4000-8000-000000000002  dev_user_role=patient
 * y sembrar un row en `patients` con ese `auth_user_id`.
 */
export const DEV_PATIENT_UUID = '00000000-0000-4000-8000-000000000002';

const DEFAULT_USER_ROLE: DevUserRole = 'doctor';

function isValidRole(value: string | null | undefined): value is DevUserRole {
  return value === 'doctor' || value === 'super_admin' || value === 'patient';
}

export function resolveFromRaw(
  rawId: string | null | undefined,
  rawRole: string | null | undefined,
): DevUser {
  const id = rawId && rawId.trim().length > 0 ? rawId.trim() : DEV_DOCTOR_UUID;
  const role = isValidRole(rawRole) ? rawRole : DEFAULT_USER_ROLE;
  return { id, role };
}

/**
 * Returns the dev user identity from a NextRequest's cookies.
 * Safe for Edge Runtime — does NOT import next/headers or any Node.js module.
 *
 * @param requestCookies — the `cookies` property of a NextRequest object.
 */
export function getDevUserFromRequest(requestCookies: RequestCookies): DevUser {
  return resolveFromRaw(
    requestCookies.get('dev_user_id')?.value,
    requestCookies.get('dev_user_role')?.value,
  );
}
