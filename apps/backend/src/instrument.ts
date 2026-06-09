/**
 * Sentry instrumentation — must be imported as the very first side effect in main.ts.
 *
 * Initialization is double-gated:
 *   1. SENTRY_DSN must be present and non-empty.
 *   2. SENTRY_ENABLED must be 'true' — allows enabling Sentry independently of
 *      NODE_ENV, so staging and canary environments can opt in without being
 *      classified as 'production'.
 *
 * PII policy: sendDefaultPii is explicitly false — no request bodies,
 * IP addresses, or user-identifying headers are forwarded to Sentry.
 */
import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';

const logger = new Logger('Sentry');

const dsn = process.env.SENTRY_DSN;
const sentryEnabled = process.env.SENTRY_ENABLED === 'true';

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Disable the SDK entirely when SENTRY_ENABLED != 'true' so that local and
    // test environments never enqueue events.
    enabled: sentryEnabled,
    // Never forward PII (request body, IP, user data).
    sendDefaultPii: false,
  });

  if (sentryEnabled) {
    logger.log(`Sentry initialized (env: ${process.env.NODE_ENV ?? 'development'})`);
  } else {
    logger.log('Sentry disabled — SENTRY_ENABLED is not "true"');
  }
} else {
  logger.warn('SENTRY_DSN not set — Sentry is disabled (no-op)');
}
