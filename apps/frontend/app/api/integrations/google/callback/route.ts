/**
 * GET /api/integrations/google/callback
 *
 * OAuth2 callback — receives the authorization code from Google, validates the
 * CSRF `state` against the cookie set when the flow started, exchanges the code
 * for tokens via the NestJS backend, then redirects to /doctor/settings.
 *
 * ETAPA 1: Uses dev-auth headers (x-dev-user-id / x-dev-user-role).
 * ETAPA 2: Replace backendPost with Auth0-aware api-client (same shape).
 *
 * Happy path:
 *   ?code=4/...&state=... (matches cookie) → POST /api/integrations/google/connect { code }
 *              → redirect /doctor/settings?tab=integrations&google=connected
 *
 * Error cases:
 *   ?error=access_denied → redirect with error query param
 *   state mismatch/missing → redirect with error (CSRF guard)
 *   Backend non-2xx     → redirect with error query param
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

const STATE_COOKIE = 'g_oauth_state';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const settingsUrl = `${origin}/doctor/settings?tab=integrations`;

  const fail = (msg: string): NextResponse => {
    const res = NextResponse.redirect(`${settingsUrl}&google_error=${encodeURIComponent(msg)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // Google may return an error (e.g. user denied consent)
  const errorParam = req.nextUrl.searchParams.get('error');
  if (errorParam) {
    return fail(errorParam === 'access_denied' ? 'acceso_denegado' : 'error_google');
  }

  // CSRF guard: the returned state must match the cookie set at flow start.
  const returnedState = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return fail('estado_invalido');
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return fail('codigo_faltante');
  }

  const result = await backendPost<unknown>('/api/integrations/google/connect', { code });
  if (!result.ok) {
    return fail(result.error.message ?? 'error_conexion');
  }

  const res = NextResponse.redirect(`${settingsUrl}&google=connected`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
