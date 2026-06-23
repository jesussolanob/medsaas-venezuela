'use server';

/**
 * blocked-logout-action.ts
 *
 * Server action invocada cuando el portal del médico detecta ACCOUNT_BLOCKED.
 * Limpia la sesión dev-stub (Etapa 1) y redirige a /login con un parámetro
 * que le permite al login mostrar el aviso de cuenta bloqueada.
 *
 * ETAPA 2 (Auth0): reemplazar cookie.delete por Auth0 /v2/logout,
 * manteniendo el parámetro ?blocked=1 para que el login muestre el aviso.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function blockedLogoutAction(): Promise<void> {
  // Etapa 2 (Auth0): delegar al /auth/logout del SDK (limpia la sesión httpOnly).
  // Nota: en auth0 se pierde el aviso ?blocked=1 (el retorno lo controla Auth0);
  // la cuenta bloqueada igual será rechazada por el guard en el siguiente acceso.
  if ((process.env.AUTH_MODE ?? 'dev') === 'auth0') {
    redirect('/auth/logout');
  }
  const cookieStore = await cookies();
  cookieStore.delete('dev_user_id');
  cookieStore.delete('dev_user_role');
  redirect('/login?blocked=1');
}
