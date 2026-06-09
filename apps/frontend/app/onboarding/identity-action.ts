'use server';

/**
 * identity-action.ts
 *
 * ETAPA 1 dev-stub: returns the current dev user identity from cookies.
 * Used by the onboarding page (client component) to resolve the acting user
 * without touching supabase.auth.
 *
 * ETAPA 2 (Auth0): delete this file. Read identity from the Auth0 session
 * (httpOnly cookie + JWT verification in api-client.server.ts).
 */

import { resolveIdentity } from '@/lib/identity.server';

export interface DevIdentity {
  id: string;
  role: string;
}

export async function getDevIdentityAction(): Promise<DevIdentity> {
  const user = await resolveIdentity();
  return { id: user.id, role: user.role };
}
