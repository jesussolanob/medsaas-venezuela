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

  return { success: true, role: identity.role, destination: identity.destination };
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete('dev_user_id');
  cookieStore.delete('dev_user_role');
  redirect('/login');
}
