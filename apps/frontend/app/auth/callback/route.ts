import { NextResponse } from 'next/server';

/**
 * GET /auth/callback
 *
 * AUTH_MODE=dev  → Auth0 SDK is not wired; redirect to /login (original behavior).
 * AUTH_MODE=auth0 → Auth0 middleware in proxy.ts intercepts /auth/* before this
 *                   handler is reached. This file is a safety fallback.
 *
 * In auth0 mode the SDK handles the OIDC callback via auth0.middleware() in
 * proxy.ts, which exchanges the authorization code for session tokens and
 * redirects to the app. This route handler should therefore never be hit in
 * normal auth0-mode operation.
 *
 * If it IS reached in auth0 mode (e.g. middleware misconfiguration), redirect
 * to /auth/login so the user can retry cleanly.
 */
export function GET(request: Request): NextResponse {
  const { origin } = new URL(request.url);
  const authMode = process.env.AUTH_MODE ?? 'dev';

  if (authMode === 'auth0') {
    // Middleware should have handled this. Redirect to login as a safe fallback.
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // dev mode: no OAuth exchange; go back to the dev login page.
  return NextResponse.redirect(`${origin}/login`);
}
