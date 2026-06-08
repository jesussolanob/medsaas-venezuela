/**
 * proxy.ts  (Next.js 16 middleware — renamed from middleware.ts)
 *
 * ENV-GATED dual-mode middleware:
 *
 *   AUTH_MODE=dev (default)
 *     — Reads identity from dev_user_id / dev_user_role cookies (Etapa 1 stub).
 *     — No Auth0 SDK involved at all.
 *
 *   AUTH_MODE=auth0 (Etapa 2)
 *     — Delegates to auth0.middleware(request) which:
 *         • mounts /auth/login, /auth/logout, /auth/callback routes.
 *         • silently refreshes the Auth0 session cookie on every request.
 *     — After the Auth0 middleware runs, protects /admin, /doctor, /patient
 *       by checking the session and the role claim from AUTH0_ROLE_NAMESPACE.
 *
 * NOTE: The middleware runs in the Edge Runtime. Neither next/headers nor
 * Node.js built-ins are available here. The Auth0 SDK is designed to run on
 * Edge (it ships an edge-compatible bundle).
 *
 * In both modes the RBAC redirect table is identical:
 *   /admin   → only super_admin
 *   /doctor  → doctor | super_admin
 *   /patient → patient | super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDevUserFromRequest } from '@/lib/dev-auth.edge';

// Read at middleware init time (module scope = once per worker).
const AUTH_MODE = process.env.AUTH_MODE ?? 'dev';
const ROLE_NAMESPACE = process.env.AUTH0_ROLE_NAMESPACE ?? 'https://deltamedical.app';

// ---------------------------------------------------------------------------
// Shared RBAC check — same logic for both modes
// ---------------------------------------------------------------------------

function applyRbac(request: NextRequest, role: string): NextResponse | null {
  const path = request.nextUrl.pathname;

  if (path.startsWith('/admin') && role !== 'super_admin') {
    const target =
      role === 'patient' ? '/patient/dashboard' : role === 'doctor' ? '/doctor' : '/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (path.startsWith('/doctor') && role !== 'doctor' && role !== 'super_admin') {
    const target = role === 'patient' ? '/patient/dashboard' : '/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (path.startsWith('/patient') && role !== 'patient' && role !== 'super_admin') {
    const target = role === 'doctor' ? '/doctor' : '/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dev mode handler — identical to original proxy logic
// ---------------------------------------------------------------------------

function handleDevMode(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  const devUserIdCookie = request.cookies.get('dev_user_id')?.value ?? null;
  const isAuthenticated = devUserIdCookie !== null && devUserIdCookie.trim().length > 0;

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  const { role } = getDevUserFromRequest(request.cookies);
  return applyRbac(request, role) ?? NextResponse.next();
}

// ---------------------------------------------------------------------------
// Auth0 mode handler
// ---------------------------------------------------------------------------

async function handleAuth0Mode(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Dynamically import the Auth0Client to keep it out of the dev bundle.
  // The `@auth0/nextjs-auth0` package ships an edge-compatible entry point.
  const { Auth0Client } = await import('@auth0/nextjs-auth0/server');

  // Build a minimal Auth0Client for middleware use only (reads env automatically).
  const domain = process.env.AUTH0_DOMAIN ?? '';
  const clientId = process.env.AUTH0_CLIENT_ID ?? '';
  const clientSecret = process.env.AUTH0_CLIENT_SECRET ?? '';
  const secret = process.env.AUTH0_SECRET ?? '';
  const appBaseUrl =
    process.env.AUTH0_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://localhost:3000';

  const auth0 = new Auth0Client({
    domain,
    clientId,
    clientSecret,
    secret,
    appBaseUrl,
    authorizationParameters: { scope: 'openid profile email' },
  });

  // Let the Auth0 middleware handle /auth/* routes (login, logout, callback)
  // and refresh the session cookie. It returns a Response for /auth/* paths,
  // or a "pass-through" response for all other paths.
  const auth0Response = await auth0.middleware(request);

  // If the SDK produced a real response (redirect or /auth/* route handling),
  // return it immediately — do not apply RBAC on /auth/* paths.
  if (path.startsWith('/auth/')) {
    return auth0Response as NextResponse;
  }

  // For protected routes: check that a valid session exists.
  const session = await auth0.getSession();

  if (!session?.user) {
    // Not authenticated — redirect to Auth0 Universal Login.
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Extract role from the custom claim set by Auth0 Actions.
  const role: string =
    (session.user[`${ROLE_NAMESPACE}/role`] as string | undefined) ?? 'doctor';

  return applyRbac(request, role) ?? (auth0Response as NextResponse);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (AUTH_MODE === 'auth0') {
    return handleAuth0Mode(request);
  }

  // Default: dev mode (AUTH_MODE=dev or anything else).
  return handleDevMode(request);
}

export const config = {
  matcher: ['/admin/:path*', '/doctor/:path*', '/patient/:path*', '/auth/:path*'],
};
