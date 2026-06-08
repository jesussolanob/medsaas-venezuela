/**
 * Sentry instrumentation — must be imported as the very first side effect in main.ts.
 *
 * Initialization is env-gated: if SENTRY_DSN is absent or empty the SDK is
 * never loaded, keeping local/test environments fully silent.
 *
 * PII policy: sendDefaultPii is explicitly false — no request bodies,
 * IP addresses, or user-identifying headers are forwarded to Sentry.
 */
import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';

const logger = new Logger('Sentry');

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Never forward PII (request body, IP, user data).
    sendDefaultPii: false,
  });
  logger.log(`Sentry initialized (env: ${process.env.NODE_ENV ?? 'development'})`);
} else {
  logger.warn('SENTRY_DSN not set — Sentry is disabled (no-op)');
}
