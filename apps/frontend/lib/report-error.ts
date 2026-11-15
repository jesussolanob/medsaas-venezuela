/**
 * reportError — central error-observability utility for the frontend.
 *
 * Policy:
 *  - ALWAYS emits a console.warn (visible in local dev and server logs).
 *    Uses warn instead of error so browser DevTools error-count stays clean
 *    and the signal remains usable for real errors.
 *  - Sends to Sentry ONLY in production to avoid noise/quota burn in dev.
 *    The @sentry/nextjs import is dynamic so it does NOT inflate the bundle
 *    when Sentry is not initialised.
 *  - NEVER logs PII: callers must not pass raw patient data as `extra`.
 *
 * Usage:
 *   import { reportError } from '@/lib/report-error'
 *   reportError('patients/page', 'fetchData', err)
 *   reportError('email', 'sendEmail', err, { statusCode: 500 })
 */
import { safeStringify } from '@/lib/safe-stringify';
import { isSentryEnabled } from '@/lib/sentry-env';

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return safeStringify(error);
}

export function reportError(file: string, method: string, error: unknown, extra?: unknown): void {
  const msg = extractMessage(error);
  const extraStr = extra !== undefined ? ` | extra: ${safeStringify(extra)}` : '';
  // Always warn — visible in local dev console and Node.js server output.
  console.warn(`[${file}][${method}] ${msg}${extraStr}`);

  // Send to Sentry only when explicitly enabled via NEXT_PUBLIC_SENTRY_ENABLED=true.
  if (isSentryEnabled()) {
    // Dynamic import keeps @sentry/nextjs out of the critical path when the SDK
    // has not been initialised (e.g. missing DSN in staging).
    import('@sentry/nextjs')
      .then(({ captureException, withScope }) => {
        withScope((scope) => {
          scope.setTag('file', file);
          scope.setTag('method', method);
          // Group by call site. Every report captured here shares this function's
          // stack, so Sentry's default stack-based grouping merged unrelated
          // failures into a single issue whose title came from whichever error
          // landed first (e.g. [getScheduledAppointments] and
          // [getDashboardFinanceSummary] shared one issue).
          scope.setFingerprint([file, method]);
          // A business rule the backend rejected on purpose (409 conflict, 422
          // invalid transition…) is already shown to the user and is not a bug:
          // keep it in Sentry as a warning instead of an error.
          if (isBusinessRejection(extra)) scope.setLevel('warning');
          if (extra !== undefined) {
            // Attach extra context under a safe key — never set PII here.
            scope.setExtra('context', extra);
          }
          captureException(error instanceof Error ? error : new Error(msg));
        });
      })
      .catch(() => {
        // If Sentry itself fails, do nothing — the warn above already captured it.
      });
  }
}

const BUSINESS_REJECTION_STATUSES = new Set([409, 422]);

function isBusinessRejection(extra: unknown): boolean {
  if (!extra || typeof extra !== 'object') return false;
  const status = (extra as { status?: unknown }).status;
  return typeof status === 'number' && BUSINESS_REJECTION_STATUSES.has(status);
}
