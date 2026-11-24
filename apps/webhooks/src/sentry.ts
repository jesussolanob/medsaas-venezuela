/**
 * Sentry integration — enabled only when SENTRY_DSN is set.
 *
 * Uses lazy require() so @sentry/node is NOT loaded at all when the DSN is
 * absent (local dev, staging). This avoids OpenTelemetry side effects in
 * environments where Sentry is intentionally disabled.
 */

import type * as SentryTypes from '@sentry/node';

type SentryModule = typeof SentryTypes;

let sentry: SentryModule | null = null;

/** Call once at startup. No-op when SENTRY_DSN is not set. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = require('@sentry/node') as SentryModule;
  sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  // Tag every event with the service name for filtering in Sentry.
  sentry.setTag('service', 'webhooks');
}

/** Capture a warning-level message. Fingerprint groups duplicate events. */
export function captureWarning(message: string, opts?: { fingerprint?: string[] }): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    scope.setLevel('warning');
    if (opts?.fingerprint) scope.setFingerprint(opts.fingerprint);
    sentry!.captureMessage(message);
  });
}

/** Capture an exception as an error. Tags are indexed for filtering in Sentry. */
export function captureError(error: unknown, opts?: { tags?: Record<string, string> }): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    if (opts?.tags) {
      for (const [k, v] of Object.entries(opts.tags)) {
        scope.setTag(k, v);
      }
    }
    sentry!.captureException(error);
  });
}

/** Flush pending events before process exit (call on SIGTERM). */
export async function flushSentry(): Promise<void> {
  if (!sentry) return;
  await sentry.close(2000);
}
