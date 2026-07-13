import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

// CSRF protection: a random state is set as an httpOnly cookie when the OAuth
// flow starts, and validated against the `state` query param in the callback.
const STATE_COOKIE = 'g_oauth_state';

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Priority matches the callback route and deploy.yml:
  // APP_BASE_URL is set at runtime by Cloud Run (= public FURL).
  // NEXT_PUBLIC_URL and NEXTAUTH_URL are NOT runtime vars in production.
  // new URL(req.url).origin resolves to 0.0.0.0:8080 inside Cloud Run containers
  // and must be the last resort, not relied upon in prod.
  const baseUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXTAUTH_URL ||
    new URL(req.url).origin;

  // AUDIT FIX 2026-04-28 (FASE 5D): redirigir a /auth/error en lugar de
  // devolver HTML inline (UX inconsistente + riesgo de XSS si baseUrl viene
  // de un header poisoned).
  if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') {
    return NextResponse.redirect(`${baseUrl}/auth/error?type=google_config_missing`);
  }
  if (!clientSecret) {
    return NextResponse.redirect(`${baseUrl}/auth/error?type=google_config_missing`);
  }

  const redirectUri = `${baseUrl}/api/integrations/google/callback`;
  const state = randomUUID();

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.append('client_id', clientId);
  googleAuthUrl.searchParams.append('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.append('response_type', 'code');
  // AUDIT FIX 2026-04-28 (FASE 5D): scopes ampliados a userinfo.email para
  // identificar la cuenta conectada al doctor sin ronda extra de consent.
  googleAuthUrl.searchParams.append(
    'scope',
    'https://www.googleapis.com/auth/calendar.events openid email profile',
  );
  googleAuthUrl.searchParams.append('access_type', 'offline');
  googleAuthUrl.searchParams.append('prompt', 'consent');
  googleAuthUrl.searchParams.append('state', state);

  const res = NextResponse.redirect(googleAuthUrl.toString());
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/', // broad path so the cookie is reliably sent on the callback redirect
    maxAge: 600, // 10 min — the OAuth round-trip should complete well within this
  });
  return res;
}
