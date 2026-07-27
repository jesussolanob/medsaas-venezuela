/**
 * Sentry server / edge instrumentation.
 * Runs in Node.js (server) and Edge runtime.
 * Only initializes when NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * Next.js 16 App Router loads this file automatically via the instrumentation
 * hook (stable in Next.js 15+, no experimental flag required).
 */
export async function register() {
  // Attach the backend IAM token to all server-side fetches to the backend.
  // Independent of Sentry — must run even when the DSN is absent.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    installBackendAuthInterceptor();
  }

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  // No-op when DSN is absent — keeps local dev silent.
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      // Controlled via NEXT_PUBLIC_SENTRY_ENABLED env var (true|false).
      enabled: process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      // Source maps are uploaded separately via SENTRY_AUTH_TOKEN in CI.
      // TODO: configure SENTRY_AUTH_TOKEN for production source maps.
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      // Controlled via NEXT_PUBLIC_SENTRY_ENABLED env var (true|false).
      enabled: process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
    });
  }
}

/**
 * Sentry onRequestError hook — captures unhandled errors from Server Components,
 * Server Actions, and Route Handlers (Next.js 15+ instrumentation API).
 *
 * The `request` parameter shape matches Next.js' InstrumentationOnRequestError
 * and Sentry's internal RequestInfo type (path, method, headers).
 */
export const onRequestError = async (
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: { routerKind: string; routePath: string; routeType: string },
) => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(error, request, context);
};

/**
 * Installs a one-time global `fetch` interceptor that attaches a Google-signed
 * OIDC ID token to every server-side request bound for the IAM-protected backend
 * on Cloud Run (--no-allow-unauthenticated). The token's audience is the backend
 * URL, validated by Cloud Run's IAM layer before the request reaches the app.
 *
 * Inert unless BOTH BACKEND_IAM_AUDIENCE and BACKEND_INTERNAL_URL are set, so
 * local dev and non-GCP hosts are unaffected. Node.js runtime only — the Edge
 * middleware (proxy.ts) makes its own backend call and degrades gracefully if it
 * cannot reach the backend (falls back to the Auth0 role claim).
 */
function installBackendAuthInterceptor(): void {
  const audience = process.env.BACKEND_IAM_AUDIENCE;
  const backendBase = process.env.BACKEND_INTERNAL_URL;
  if (!backendBase) return;

  // Two independent reasons to patch fetch:
  //   - needsIamToken: GCP IAM-protected backend (Cloud Run) → Authorization Bearer.
  //   - needsUserToken: AUTH_MODE=auth0 → forward the end-user's Auth0 ID token.
  // Locally (auth0 mode, no GCP IAM) only the user token applies — this is what
  // keeps local behavior identical to prod. In dev-stub mode neither applies → inert.
  const needsIamToken = Boolean(audience);
  const needsUserToken = (process.env.AUTH_MODE ?? 'dev') === 'auth0';
  if (!needsIamToken && !needsUserToken) return;

  const METADATA_URL =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
  const REFRESH_SKEW_MS = 5 * 60 * 1000;
  const FALLBACK_TTL_MS = 50 * 60 * 1000;

  // Capture the original fetch BEFORE patching, and use it internally to avoid
  // re-entering the interceptor when fetching the token itself.
  const originalFetch = globalThis.fetch;
  let cached: { token: string; expMs: number } | null = null;

  // Etapa 2 (AUTH_MODE=auth0): reader for the end-user's Auth0 ID token.
  // Imported once (module-cached); returns null in dev mode or when there is no
  // session, so dev and @Public requests are unaffected.
  const userTokenModule = import('@/lib/auth0-token.server');
  async function userAuth0Token(): Promise<string | null> {
    try {
      const { getAuth0IdToken } = await userTokenModule;
      return await getAuth0IdToken();
    } catch {
      return null;
    }
  }

  // Reviewer access token: forwarded unconditionally when the cookie is present.
  // The backend ignores it when REVIEWER_ACCESS_ENABLED is off, so forwarding
  // it is always safe. Imported once (module-cached).
  const reviewerTokenModule = import('@/lib/reviewer-token.server');
  async function reviewerToken(): Promise<string | null> {
    try {
      const { getReviewerToken } = await reviewerTokenModule;
      return await getReviewerToken();
    } catch {
      return null;
    }
  }

  async function idToken(): Promise<string> {
    const now = Date.now();
    if (cached && cached.expMs - REFRESH_SKEW_MS > now) return cached.token;
    const res = await originalFetch(`${METADATA_URL}?audience=${encodeURIComponent(audience!)}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`metadata id-token request failed: ${res.status}`);
    const token = (await res.text()).trim();
    let expMs = now + FALLBACK_TTL_MS;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as {
        exp?: number;
      };
      if (typeof payload.exp === 'number') expMs = payload.exp * 1000;
    } catch {
      // Non-decodable token — keep the conservative fallback TTL.
    }
    cached = { token, expMs };
    return token;
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(backendBase)) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      // GCP IAM Bearer — only when running against an IAM-protected backend (prod).
      if (needsIamToken) {
        headers.set('Authorization', `Bearer ${await idToken()}`);
      }
      // Etapa 2: forward the end-user's Auth0 ID token so the backend's
      // Auth0Guard can validate it and resolve the caller's profile. Absent for
      // unauthenticated requests — those proceed without it.
      let userToken: string | null = null;
      if (needsUserToken) {
        userToken = await userAuth0Token();
        if (userToken) headers.set('x-auth0-token', userToken);
      }
      // Reviewer access: forward the HMAC token when the cookie is present, but
      // ONLY when there is no real Auth0 session.
      //
      // CRITICAL: AppAuthGuard checks the reviewer path BEFORE the Auth0 path, so
      // sending both headers would serve the demo doctor profile to a genuinely
      // authenticated user. The reviewer_token cookie lives 12h, so this happens
      // whenever someone uses the demo login and then signs in for real in the
      // same browser. identity.server.ts already gives Auth0 precedence when
      // resolving the identity — this keeps the forwarded headers consistent with
      // that decision. The backend enforces the same precedence independently.
      if (!userToken) {
        const rvToken = await reviewerToken();
        if (rvToken) headers.set('x-reviewer-token', rvToken);
      }
      return originalFetch(input, { ...init, headers });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
