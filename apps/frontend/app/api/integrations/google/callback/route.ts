/**
 * GET /api/integrations/google/callback
 *
 * OAuth2 callback — receives the authorization code from Google, validates the
 * CSRF `state` against the cookie set when the flow started, exchanges the code
 * for tokens via the NestJS backend, then redirects to the returnTo path
 * (from the g_oauth_return_to httpOnly cookie) or /doctor/settings by default.
 *
 * ETAPA 1: Uses dev-auth headers (x-dev-user-id / x-dev-user-role).
 * ETAPA 2: Replace backendPost with Auth0-aware api-client (same shape).
 *
 * Happy path:
 *   ?code=4/...&state=... (matches cookie) → POST /api/integrations/google/connect { code }
 *              → redirect <returnTo or /doctor/settings?tab=integrations>&google=connected
 *
 * Error cases:
 *   ?error=access_denied → redirect with error query param
 *   state mismatch/missing → redirect with error (CSRF guard)
 *   Backend non-2xx     → redirect with error query param
 *
 * Security note on returnTo: the value was validated against an exact allowlist
 * (RETURN_TO_ALLOWLIST in google/auth/route.ts) when the flow started, so here
 * we only re-validate that it starts with '/' (not '//') as a defense-in-depth
 * check. We never trust a path that arrived from Google or from any query param
 * on this callback URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

const STATE_COOKIE = 'g_oauth_state';
const RETURN_TO_COOKIE = 'g_oauth_return_to';

/** Strict allowlist re-check: same set as in google/auth/route.ts. */
const RETURN_TO_ALLOWLIST: ReadonlySet<string> = new Set([
  '/admin/settings',
  '/doctor/settings',
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  // APP_BASE_URL PRIMERO: es la URL pública REAL que sirve la app, seteada en
  // runtime por Cloud Run (= deltasalud.app en prod, staging.deltasalud.app en
  // staging). NEXT_PUBLIC_URL se inlinea en build-time desde vars.FRONTEND_URL, que
  // quedó apuntando al *.run.app viejo tras el cutover de dominio (2026-07-18) → si
  // se prioriza, el callback redirige a OTRO host donde las cookies de sesión
  // (reviewer_token / Auth0) NO existen → rebote a /auth/login. Debe reflejar la
  // prioridad de google/auth/route.ts (APP_BASE_URL primero) para que ida y vuelta
  // usen el MISMO host. En Cloud Run, new URL(req.url).origin cae al bind interno
  // (0.0.0.0:8080), por eso es el último recurso.
  const origin =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXTAUTH_URL ||
    new URL(req.url).origin;

  // Resolve the return destination from the httpOnly cookie set at flow start.
  // Re-validate against allowlist to defend against cookie tampering.
  const rawReturnTo = req.cookies.get(RETURN_TO_COOKIE)?.value ?? '';
  const returnPath = RETURN_TO_ALLOWLIST.has(rawReturnTo)
    ? rawReturnTo
    : '/doctor/settings';

  // Build the success/error base URLs depending on the return path.
  const successBase =
    returnPath === '/admin/settings'
      ? `${origin}/admin/settings`
      : `${origin}/doctor/settings?tab=integrations`;
  const errorBase = successBase;

  function clearCookies(res: NextResponse): NextResponse {
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(RETURN_TO_COOKIE);
    return res;
  }

  const fail = (msg: string): NextResponse => {
    const res = NextResponse.redirect(
      `${errorBase}${returnPath === '/admin/settings' ? '?' : '&'}google_error=${encodeURIComponent(msg)}`,
    );
    return clearCookies(res);
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

  const successUrl =
    returnPath === '/admin/settings'
      ? `${origin}/admin/settings?google=connected`
      : `${origin}/doctor/settings?tab=integrations&google=connected`;

  const res = NextResponse.redirect(successUrl);
  return clearCookies(res);
}
