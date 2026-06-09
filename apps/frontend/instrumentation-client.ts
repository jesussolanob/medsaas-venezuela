/**
 * Sentry browser instrumentation.
 * Next.js 16 loads this file automatically on the client side.
 * Only initializes when NEXT_PUBLIC_SENTRY_DSN is set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Controlled via NEXT_PUBLIC_SENTRY_ENABLED env var (true|false).
    enabled: process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true",
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    // Replay is opt-in. Enable in production by uncommenting:
    // replaysSessionSampleRate: 0.1,
    // replaysOnErrorSampleRate: 1.0,
    // integrations: [Sentry.replayIntegration()],
  });
}

/**
 * Instruments client-side navigation transitions for Sentry tracing.
 * Required by @sentry/nextjs to track App Router page navigations.
 * This export is a no-op when Sentry is not initialized (DSN absent).
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
