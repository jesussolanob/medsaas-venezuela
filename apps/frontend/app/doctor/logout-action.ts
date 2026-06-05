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
  const cookieStore = await cookies();
  // Clear the dev-auth identity cookies set by the login dev-stub.
  cookieStore.delete('dev_user_id');
  cookieStore.delete('dev_user_role');
  redirect('/login');
}
