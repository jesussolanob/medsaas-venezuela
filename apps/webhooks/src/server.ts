/**
 * Plain node:http server — no framework access logs, minimal overhead.
 *
 * Routes:
 *   GET  /health → 200 {status:"ok"}
 *   POST /zernio → Zernio webhook handler
 *   *            → 404
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleZernioWebhook } from './handlers/zernio';
import { readBody } from './lib/body-reader';
import { getIdToken } from './lib/token-cache';
import { logError, logWarn } from './lib/log';
import { captureError } from './sentry';

export interface ServerConfig {
  secret: string;
  backendUrl: string;
}

function writeJson(res: ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function createWebhookServer(config: ServerConfig): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse): void => {
    void handleRequest(req, res, config);
  });

  // Suppress the default error/request logging emitted by some Node versions.
  server.on('error', (err) => {
    logError({
      message: 'HTTP server error',
      outcome: 'backend_error',
      reason: err.message,
    });
    captureError(err);
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  try {
    // Health check — fast path, no body needed.
    if (method === 'GET' && url === '/health') {
      writeJson(res, 200, { status: 'ok' });
      return;
    }

    // Webhook endpoint.
    if (method === 'POST' && url === '/zernio') {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch (err) {
        const isTooLarge = err instanceof Error && err.message === 'body too large';

        if (isTooLarge) {
          logWarn({
            message: 'Zernio webhook body exceeds 512 KB limit',
            outcome: 'too_large',
          });
          writeJson(res, 413, { error: 'Payload too large' });
        } else {
          logError({
            message: 'Error reading request body',
            outcome: 'backend_error',
            reason: err instanceof Error ? err.message : String(err),
          });
          captureError(err);
          writeJson(res, 500, { error: 'Internal server error' });
        }
        return;
      }

      const signatureHeader = Array.isArray(req.headers['x-zernio-signature'])
        ? req.headers['x-zernio-signature'][0]
        : req.headers['x-zernio-signature'];

      const result = await handleZernioWebhook(rawBody, signatureHeader, {
        secret: config.secret,
        backendUrl: config.backendUrl,
        getToken: getIdToken,
        doFetch: fetch,
      });

      writeJson(res, result.status, result.body);
      return;
    }

    writeJson(res, 404, { error: 'Not found' });
  } catch (err) {
    logError({
      message: 'Unexpected error handling webhook request',
      outcome: 'backend_error',
      reason: err instanceof Error ? err.message : String(err),
    });
    captureError(err);
    if (!res.headersSent) {
      writeJson(res, 500, { error: 'Internal server error' });
    }
  }
}
