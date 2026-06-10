import 'server-only';

import { redirect } from 'next/navigation';
import { resolveIdentity } from '@/lib/identity.server';

/**
 * /post-login — post-authentication dispatcher.
 *
 * Auth0 returns the user here after a successful callback (the login links pass
 * `returnTo=/post-login`). We resolve the user's identity server-side and send
 * them to their role-based portal, instead of leaving them on the public
 * landing page (`/`), which looks logged-out.
 *
 * Role → portal mapping mirrors proxy.ts `applyRbac` and login/actions.ts:
 *   super_admin → /admin
 *   patient     → /patient/dashboard
 *   doctor/else → /doctor
 *
 * If the session cannot be resolved (no Auth0 session), fall back to /login.
 */
export const dynamic = 'force-dynamic';

function destinationForRole(role: string): string {
  if (role === 'super_admin') return '/admin';
  if (role === 'patient') return '/patient/dashboard';
  return '/doctor';
}

export default async function PostLoginPage(): Promise<never> {
  let destination = '/login';
  try {
    const { role } = await resolveIdentity();
    destination = destinationForRole(role);
  } catch {
    // No session / resolution failed — send back to login.
    destination = '/login';
  }

  redirect(destination);
}
