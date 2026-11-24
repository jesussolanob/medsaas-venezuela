/**
 * Core logic for POST /zernio — no business logic, pure forwarding.
 *
 * Flow:
 *   1. Verify HMAC-SHA256 signature (fail-closed → 401).
 *   2. Obtain Google IAM identity token for the backend audience.
 *   3. Forward the EXACT raw bytes to the private backend with the IAM token.
 *   4. Map backend response to the status Zernio should see:
 *        - backend 2xx           → 200 {received:true}
 *        - backend 4xx !408 !429 → 200 {received:true}  (suppress retry)
 *        - backend 5xx/408/429   → 502                  (let Zernio retry)
 *        - timeout / network     → 502
 *
 * Dependencies are injected so the handler is fully unit-testable without
 * network access or environment variables.
 *
 * PII policy: never log body, phone, names, message text, signatures, tokens.
 */

import { verifyZernioSignature } from '../lib/signature';
import { logError, logWarn } from '../lib/log';
import { captureError, captureWarning } from '../sentry';

/** HTTP status codes that should trigger a Zernio retry (502 to caller). */
const RETRYABLE_4XX = new Set([408, 429]);

export interface ZernioHandlerDeps {
  secret: string;
  backendUrl: string;
  /** Resolves a Google OIDC token for the given audience URL. */
  getToken: (audience: string) => Promise<string>;
  /** Executes an HTTP fetch (injected so tests can mock network). */
  doFetch: typeof fetch;
}

export interface ZernioHandlerResult {
  status: number;
  body: object;
}

/**
 * Extracts only the `id` and `event` top-level fields from the payload for
 * use in error log context. Never throws — returns an empty object on any
 * parse failure. Never returns PII fields (phone, name, message text, etc.).
 */
function safeLogContext(rawBody: Buffer): { eventId?: string; event?: string } {
  try {
    const parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    return {
      eventId: typeof parsed['id'] === 'string' ? parsed['id'] : undefined,
      event: typeof parsed['event'] === 'string' ? parsed['event'] : undefined,
    };
  } catch {
    return {};
  }
}

export async function handleZernioWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  deps: ZernioHandlerDeps,
): Promise<ZernioHandlerResult> {
  const { secret, backendUrl, getToken, doFetch } = deps;

  // 1. Signature verification (fail-closed).
  if (!verifyZernioSignature(rawBody, signatureHeader, secret)) {
    logWarn({
      message: 'Zernio webhook: missing or invalid signature',
      outcome: 'bad_signature',
    });
    captureWarning('Zernio webhook: bad or missing signature', {
      fingerprint: ['zernio-bad-signature'],
    });
    return { status: 401, body: { error: 'Invalid signature' } };
  }

  // Log context (safe — id and event only, no PII).
  const ctx = safeLogContext(rawBody);

  // 2. Obtain IAM token.
  let token: string;
  try {
    token = await getToken(backendUrl);
  } catch (err) {
    logError({
      message: 'Failed to obtain IAM token for backend',
      outcome: 'backend_error',
      reason: err instanceof Error ? err.message : String(err),
      ...ctx,
    });
    captureError(err, { tags: { reason: 'iam_token_failure' } });
    return { status: 502, body: { error: 'Bad gateway' } };
  }

  // 3. Forward to private backend.
  const start = Date.now();
  let backendRes: Response;

  try {
    backendRes = await doFetch(`${backendUrl}/api/webhooks/zernio`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-zernio-signature': signatureHeader ?? '',
        Authorization: `Bearer ${token}`,
      },
      // Buffer (Uint8Array subclass) is a valid BodyInit at runtime but the DOM
      // lib's generic Uint8Array<ArrayBufferLike> doesn't satisfy TypeScript's
      // narrower BodyInit definition — cast through unknown to satisfy the checker.
      body: rawBody as unknown as BodyInit,
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const latencyMs = Date.now() - start;

    logError({
      message: isTimeout ? 'Backend request timed out' : 'Backend network error',
      outcome: isTimeout ? 'timeout' : 'backend_error',
      latencyMs,
      reason: err instanceof Error ? err.message : String(err),
      ...ctx,
    });
    captureError(err, { tags: { reason: isTimeout ? 'timeout' : 'network_error' } });
    return { status: 502, body: { error: 'Bad gateway' } };
  }

  const latencyMs = Date.now() - start;
  const backendStatus = backendRes.status;

  // 4. Map backend response.
  if (backendRes.ok) {
    // Success — no log line.
    return { status: 200, body: { received: true } };
  }

  if (backendStatus < 500 && !RETRYABLE_4XX.has(backendStatus)) {
    // Non-retryable 4xx: tell Zernio "received" to suppress retries,
    // but log + alert so engineers can investigate the rejected payload.
    logError({
      message: 'Backend rejected webhook (non-retryable)',
      outcome: 'backend_error',
      backendStatus,
      latencyMs,
      ...ctx,
    });
    captureError(new Error(`Backend rejected webhook: HTTP ${backendStatus}`), {
      tags: { backendStatus: String(backendStatus) },
    });
    return { status: 200, body: { received: true } };
  }

  // 5xx or retryable 4xx (408/429) — let Zernio retry.
  logError({
    message: 'Backend error or rate-limit — Zernio will retry',
    outcome: 'backend_error',
    backendStatus,
    latencyMs,
    ...ctx,
  });
  captureError(new Error(`Backend error: HTTP ${backendStatus}`), {
    tags: { backendStatus: String(backendStatus) },
  });
  return { status: 502, body: { error: 'Bad gateway' } };
}
