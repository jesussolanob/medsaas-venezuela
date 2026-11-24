/**
 * deltasalud-webhooks — public webhook relay for Zernio inbound messages.
 *
 * Receives Zernio webhook POSTs, verifies the HMAC-SHA256 signature, then
 * forwards the raw payload to the IAM-protected private backend on Cloud Run.
 * No business logic lives here — all processing happens in the backend.
 *
 * Required env vars (service exits on startup if missing):
 *   ZERNIO_WEBHOOK_SECRET  HMAC key for signature verification.
 *   BACKEND_URL            Base URL of the private backend Cloud Run service.
 *
 * Optional:
 *   PORT                   Listen port (default 8080).
 *   SENTRY_DSN             Enables Sentry error reporting.
 *   SENTRY_ENVIRONMENT     Sentry environment tag (default "production").
 */

import { initSentry, captureError, flushSentry } from './sentry';
import { createWebhookServer } from './server';
import { logError } from './lib/log';

// Initialize Sentry first so boot errors can be captured.
initSentry();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    logError({
      message: `Required env var ${name} is not set — service cannot start`,
      outcome: 'backend_error',
    });
    captureError(new Error(`Missing required env var: ${name}`));
    process.exit(1);
  }
  return val;
}

const secret = requireEnv('ZERNIO_WEBHOOK_SECRET');
const backendUrl = requireEnv('BACKEND_URL');
const port = parseInt(process.env.PORT ?? '8080', 10);

const server = createWebhookServer({ secret, backendUrl });

server.listen(port);

async function shutdown(): Promise<void> {
  server.close();
  await flushSentry();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
