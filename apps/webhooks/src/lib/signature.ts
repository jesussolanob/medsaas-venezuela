/**
 * HMAC-SHA256 signature verification for Zernio webhook payloads.
 *
 * Zernio signs the raw body with HMAC-SHA256 (key = ZERNIO_WEBHOOK_SECRET).
 * The signature is in the `x-zernio-signature` header as a lowercase hex digest,
 * optionally prefixed with `sha256=`.
 *
 * Uses timingSafeEqual to prevent timing-based enumeration attacks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * Returns true if `signatureHeader` matches the HMAC-SHA256 of `rawBody`
 * using `secret`. Returns false for any missing or invalid input.
 */
export function verifyZernioSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const hex = signatureHeader.startsWith(PREFIX)
    ? signatureHeader.slice(PREFIX.length)
    : signatureHeader;

  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Compare as UTF-8 Buffers of equal declared length to prevent short-circuit.
  const expected = Buffer.from(expectedHex, 'utf8');
  const received = Buffer.from(hex, 'utf8');

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
