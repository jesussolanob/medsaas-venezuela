/**
 * Sentry instrumentation — must be imported as the very first side effect in main.ts.
 *
 * Initialization is double-gated:
 *   1. SENTRY_DSN must be present and non-empty.
 *   2. NODE_ENV must be 'production' — in local/test environments the SDK is
 *      disabled so no events are enqueued, keeping development noise-free.
 *
 * PII policy: sendDefaultPii is explicitly false — no request bodies,
 * IP addresses, or user-identifying headers are forwarded to Sentry.
 */
import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';

const logger = new Logger('Sentry');

const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production';

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Disable the SDK entirely outside of production so that local and test
    // environments never enqueue events.
    enabled: isProd,
    // Never forward PII (request body, IP, user data).
    sendDefaultPii: false,
  });

  if (isProd) {
    logger.log(`Sentry initialized (env: ${process.env.NODE_ENV})`);
  } else {
    logger.log(`Sentry disabled in non-production env: ${process.env.NODE_ENV ?? 'development'}`);
  }
} else {
  logger.warn('SENTRY_DSN not set — Sentry is disabled (no-op)');
}
