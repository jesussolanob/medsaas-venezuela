/**
 * Sentry browser instrumentation.
 * Next.js 16 loads this file automatically on the client side.
 * Only initializes when NEXT_PUBLIC_SENTRY_DSN is set.
 */
import * as Sentry from '@sentry/nextjs';
import { isSentryEnabled, sentryEnvironment } from '@/lib/sentry-env';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    // NEXT_PUBLIC_SENTRY_ENABLED AND running on the production host (see lib/sentry-env).
    enabled: isSentryEnabled(),
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    // Ruido benigno (handled, 0 usuarios impactados) que no aporta señal:
    // - Server Actions no encontradas tras un deploy (pestañas viejas; los IDs se
    //   rehashean por build). Ya migramos las acciones ruidosas a route handlers.
    // - Fallos de red genéricos (usuario offline, navegó fuera, fetch abortado).
    // - Respuestas 204 sin cuerpo.
    // - Extensiones del navegador que mutan el DOM (traductor) o inyectan wallets
    //   (MetaMask): rompen la reconciliación de React o fallan solas; no son
    //   nuestras y no las podemos arreglar desde la app.
    ignoreErrors: [
      /Server Action .* was not found on the server/i,
      'was not found on the server',
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
      'AbortError',
      'The operation was aborted',
      'Invalid response status code 204',
      "Failed to execute 'insertBefore' on 'Node'",
      "Failed to execute 'removeChild' on 'Node'",
      'Failed to connect to MetaMask',
      // Instagram / Facebook in-app browsers: their own injected scripts fail
      // (app://navigation_performance_logger_android, app://browser_declutter).
      'Java object is gone',
    ],
    denyUrls: [/^app:\/\/(navigation_performance_logger|browser_declutter)/i],
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
