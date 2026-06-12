'use server';

/**
 * app/login/actions.ts
 *
 * ETAPA 1 — login dev-stub (reemplaza Supabase Auth; Auth0 real = Fase 4).
 *
 * NO verifica credenciales: en local no hay proveedor de auth. El rol se infiere
 * del email para enrutar a la sección correcta y se persiste en cookies del
 * dev-stub (dev_user_id / dev_user_role), que el BFF (api-client.server) reenvía
 * al backend como headers x-dev-user-id / x-dev-user-role.
 *
 *   email con "admin"               → super_admin → /admin
 *   email con "patient"/"paciente"  → patient     → /patient/dashboard
 *   resto                           → doctor       → /doctor
 *
 * Fase 4: validar credenciales contra Auth0 y derivar rol del JWT.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_DOCTOR_UUID, DEV_PATIENT_UUID, DEV_ADMIN_UUID } from '@/lib/dev-auth.edge';
import { log } from '@/lib/logger';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

/**
 * Best-effort login touch: records last_sign_in_at and applies any pending
 * subscription downgrade (active → past_due when expired). Mirrors the Auth0
 * path, where resolve-identity invokes the same backend use case. Never blocks
 * login — failures are logged and swallowed so the user always proceeds.
 */
async function postLoginTouch(identity: DevLoginIdentity): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/auth/login-touch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': identity.id,
        'x-dev-user-role': identity.role,
      },
    });
  } catch (error: unknown) {
    log.error('[loginUser] login-touch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type LoginResult =
  | { success: true; role: string; destination: string }
  | { success: false; error: string };

type DevLoginIdentity = { id: string; role: string; destination: string };

function inferIdentity(email: string): DevLoginIdentity {
  const e = email.trim().toLowerCase();
  if (e.includes('admin')) {
    return { id: DEV_ADMIN_UUID, role: 'super_admin', destination: '/admin' };
  }
  if (e.includes('patient') || e.includes('paciente')) {
    return { id: DEV_PATIENT_UUID, role: 'patient', destination: '/patient/dashboard' };
  }
  return { id: DEV_DOCTOR_UUID, role: 'doctor', destination: '/doctor' };
}

export async function loginUser(email: string, _password: string): Promise<LoginResult> {
  if (!email.trim()) {
    return { success: false, error: 'Ingresa tu email.' };
  }

  const identity = inferIdentity(email);
  const cookieStore = await cookies();
  const common = { path: '/', sameSite: 'lax' as const, httpOnly: false };
  cookieStore.set('dev_user_id', identity.id, common);
  cookieStore.set('dev_user_role', identity.role, common);

  // Record last sign-in + apply lazy subscription downgrade on login (no cron).
  await postLoginTouch(identity);

  return { success: true, role: identity.role, destination: identity.destination };
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete('dev_user_id');
  cookieStore.delete('dev_user_role');
  redirect('/login');
}
