'use server';

/**
 * logout-action.ts
 *
 * ETAPA 1 dev-stub: clears dev-auth cookies and redirects to /login.
 *
 * ETAPA 2 (Auth0): replace cookie.delete with Auth0 logout URL redirect
 * (invalidate the httpOnly session cookie via Auth0's /v2/logout endpoint).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function logoutAction(): Promise<void> {
  // Etapa 2 (Auth0): delegar a la ruta del SDK, que invalida la sesión httpOnly
  // y pasa por el /v2/logout de Auth0. Borrar las cookies dev-stub no cierra la
  // sesión real en modo auth0.
  if ((process.env.AUTH_MODE ?? 'dev') === 'auth0') {
    redirect('/auth/logout');
  }
  const cookieStore = await cookies();
  // Dev-stub: limpiar las cookies de identidad fijadas por el login local.
  cookieStore.delete('dev_user_id');
  cookieStore.delete('dev_user_role');
  redirect('/login');
}
