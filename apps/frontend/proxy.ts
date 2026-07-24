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
// Authoritative role resolution (auth0 mode)
// ---------------------------------------------------------------------------

/**
 * Resolves the caller's role from the backend (profile.role in the DB) via
 * POST /api/auth/resolve-identity — the SAME source of truth the BFF uses
 * (lib/identity.server.ts). The Auth0 ID-token claim is only a mirror that
 * depends on the post-login Action being configured perfectly; the DB role is
 * authoritative and always correct, so RBAC trusts it.
 *
 * Returns the role string, or null if the backend is unreachable / misconfigured
 * (caller then falls back to the claim role, then 'doctor').
 *
 * NOTE: runs on every protected navigation. Cheap (indexed email lookup) and
 * fine for Etapa 1; a future optimization could cache the role in a signed cookie.
 */
async function resolveRoleFromBackend(
  user: Record<string, unknown>,
  claimRole: string | null,
): Promise<string | null> {
  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';
  const secret = process.env.AUTH_RESOLVE_SECRET;
  const email = typeof user.email === 'string' ? user.email : null;
  if (!secret || !email) return null;

  try {
    const res = await fetch(`${backendUrl}/api/auth/resolve-identity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-auth-secret': secret,
      },
      body: JSON.stringify({
        email,
        sub: typeof user.sub === 'string' ? user.sub : undefined,
        role: claimRole ?? 'doctor',
        fullName: typeof user.name === 'string' ? user.name : email,
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { role?: string }; role?: string };
    return json.data?.role ?? json.role ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reviewer access check (auth0 mode only)
// ---------------------------------------------------------------------------

/**
 * Returns true when the reviewer cookie is present AND REVIEWER_ACCESS_ENABLED
 * is 'true'. The cookie's actual HMAC validity is NOT checked here — the Edge
 * runtime has no crypto access to the backend secret, and that check runs on
 * every API call in the backend's AppAuthGuard. The middleware only decides
 * whether to let the request reach /doctor without an Auth0 session.
 *
 * This is intentionally a presence check, not a cryptographic check.
 * An attacker who forges an arbitrary cookie value will pass this gate but
 * will be rejected (401) by the backend on the first data request.
 */
function hasReviewerCookie(request: NextRequest): boolean {
  if (process.env.REVIEWER_ACCESS_ENABLED !== 'true') return false;
  const token = request.cookies.get('reviewer_token')?.value;
  return typeof token === 'string' && token.length > 0;
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

  // IMPORTANT: this is the Auth0Client that actually processes the OIDC callback
  // (via auth0.middleware() below). It MUST mirror lib/auth0.ts, otherwise the
  // callback falls back to the SDK default returnTo ('/', the public landing)
  // whenever the transaction state doesn't carry a decodable returnTo — which is
  // exactly what happened after passwordless (email-code) login: the user landed
  // on the landing page instead of their portal. `signInReturnToPath: '/post-login'`
  // sends them to the role dispatcher instead. `session` mirrors the 8h cap so the
  // session cookie set at callback matches lib/auth0.ts.
  const auth0 = new Auth0Client({
    domain,
    clientId,
    clientSecret,
    secret,
    appBaseUrl,
    // `prompt=login` fuerza re-autenticación en cada login (pedir correo) aunque haya
    // sesión SSO activa → tras logout NO entra directo al portal. Debe reflejar lib/auth0.ts.
    authorizationParameters: { scope: 'openid profile email', prompt: 'login' },
    routes: { callback: '/auth/callback' },
    signInReturnToPath: '/post-login',
    session: {
      rolling: false,
      absoluteDuration: 60 * 60 * 8,
    },
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

  // Reviewer shortcut: when the reviewer_token cookie is present (and the
  // feature flag is on) let the request through as role='doctor', bypassing the
  // Auth0 session gate entirely. The real token validation happens on every
  // backend call via AppAuthGuard (x-reviewer-token header).
  if (hasReviewerCookie(request)) {
    return applyRbac(request, 'doctor') ?? (auth0Response as NextResponse);
  }

  // For protected routes: check that a valid session exists.
  const session = await auth0.getSession();

  if (!session?.user) {
    // Not authenticated — redirect to Auth0 Universal Login.
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Role for RBAC: the DB (resolve-identity) is the source of truth. The Auth0
  // claim is only a fallback (it depends on the post-login Action being correct).
  const claimRole = (session.user[`${ROLE_NAMESPACE}/role`] as string | undefined) ?? null;
  const role: string =
    (await resolveRoleFromBackend(session.user, claimRole)) ?? claimRole ?? 'doctor';

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
  // /post-login is included so auth0.middleware() processes the session cookie
  // (set by /auth/callback) before PostLoginPage calls getSession(). Without
  // this, on the first request after Auth0 callback the session may not yet be
  // readable, causing resolveIdentity() to throw and redirect to /login instead
  // of the correct role-based portal.
  matcher: ['/admin/:path*', '/doctor/:path*', '/patient/:path*', '/auth/:path*', '/post-login'],
};
