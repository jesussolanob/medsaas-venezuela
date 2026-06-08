/**
 * Sentry server / edge instrumentation.
 * Runs in Node.js (server) and Edge runtime.
 * Only initializes when NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * Next.js 16 App Router loads this file automatically via the instrumentation
 * hook (stable in Next.js 15+, no experimental flag required).
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  // No-op when DSN is absent — keeps local dev silent.
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
      // Source maps are uploaded separately via SENTRY_AUTH_TOKEN in CI.
      // TODO: configure SENTRY_AUTH_TOKEN for production source maps.
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
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

  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(error, request, context);
};
