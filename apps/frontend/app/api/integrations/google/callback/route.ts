/**
 * GET /api/integrations/google/callback
 *
 * OAuth2 callback — receives the authorization code from Google, exchanges it
 * for tokens via the NestJS backend, then redirects to /doctor/settings?tab=integrations.
 *
 * ETAPA 1: Uses dev-auth headers (x-dev-user-id / x-dev-user-role).
 * ETAPA 2: Replace backendPost with Auth0-aware api-client (same shape).
 *
 * Happy path:
 *   ?code=4/... → POST /api/integrations/google/connect { code }
 *              → redirect /doctor/settings?tab=integrations&google=connected
 *
 * Error cases:
 *   ?error=access_denied → redirect with error query param
 *   Backend non-2xx     → redirect with error query param
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const settingsUrl = `${origin}/doctor/settings?tab=integrations`;

  // Google may return an error (e.g. user denied consent)
  const errorParam = req.nextUrl.searchParams.get('error');
  if (errorParam) {
    const msg = errorParam === 'access_denied' ? 'acceso_denegado' : 'error_google';
    return NextResponse.redirect(`${settingsUrl}&google_error=${encodeURIComponent(msg)}`);
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${settingsUrl}&google_error=codigo_faltante`);
  }

  const result = await backendPost<unknown>('/api/integrations/google/connect', { code });

  if (!result.ok) {
    const msg = encodeURIComponent(result.error.message ?? 'error_conexion');
    return NextResponse.redirect(`${settingsUrl}&google_error=${msg}`);
  }

  return NextResponse.redirect(`${settingsUrl}&google=connected`);
}
