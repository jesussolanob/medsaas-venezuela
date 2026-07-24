import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * ReviewerTokenService
 *
 * Stateless HMAC-SHA256 session token for the reviewer access path.
 * Issued by POST /api/auth/reviewer-login and verified by AppAuthGuard when the
 * x-reviewer-token header is present.
 *
 * Token format (base64url-safe, dot-separated):
 *   base64url(JSON({sub, exp})) + '.' + base64url(HMAC-SHA256(secret, purpose + payload))
 *
 * Where:
 *   sub  — REVIEWER_PROFILE_ID from env (string UUID)
 *   exp  — Unix timestamp (seconds) at which the token expires
 *
 * Purpose prefix: 'reviewer-session:v1:'
 *   Namespaces this HMAC away from all other tokens so a token crafted for
 *   another service can never validate here.
 *
 * Expiry: 15 minutes (900 seconds) from issue time.
 *
 * Security guarantees:
 *   - Secret is read lazily; if REVIEWER_SESSION_SECRET is absent at mint() time
 *     the call throws. verify() returns null on any error (never throws to the
 *     caller). This allows the service to be registered globally without breaking
 *     startup when REVIEWER_ACCESS_ENABLED is off.
 *   - verify() uses timingSafeEqual on the HMAC output — prevents timing oracles.
 *   - exp is checked on verify(); stale tokens return null without throwing.
 *   - Token, HMAC, and sub are NEVER logged.
 *
 * Environment variables consumed (set in Cloud Run / .env):
 *   REVIEWER_SESSION_SECRET — high-entropy random string; required when the
 *                              reviewer path is enabled.
 *   REVIEWER_PROFILE_ID     — UUID of the demo doctor profile; required at mint().
 *
 * Deferred (Etapa 2): rate-limiting on the login endpoint (Redis token bucket or
 * a cloud-level WAF rule when reviewer access is required in production).
 */
@Injectable()
export class ReviewerTokenService {
  static readonly EXPIRY_SECONDS = 900; // 15 minutes
  private static readonly PURPOSE = 'reviewer-session:v1:';

  constructor(private readonly config: ConfigService) {}

  /**
   * Issues a reviewer session token for the given profileId.
   *
   * Throws if REVIEWER_SESSION_SECRET is not configured — call sites should only
   * invoke mint() after verifying REVIEWER_ACCESS_ENABLED === 'true'.
   *
   * @param profileId UUID of the reviewer's demo profile.
   * @returns base64url-safe token string.
   */
  mint(profileId: string): string {
    const secret = this.requireSecret();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const exp = nowSeconds + ReviewerTokenService.EXPIRY_SECONDS;
    const payload: ReviewerPayload = { sub: profileId, exp };

    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = this.computeHmac(encodedPayload, secret);

    return `${encodedPayload}.${sig}`;
  }

  /**
   * Verifies a reviewer token and returns its payload.
   *
   * Returns null on any error (invalid format, bad HMAC, expired, missing secret).
   * Never throws to the caller.
   *
   * @param token Token produced by mint().
   * @returns Parsed payload if valid and not expired; null otherwise.
   */
  verify(token: string): ReviewerPayload | null {
    try {
      const secret = this.config.get<string>('REVIEWER_SESSION_SECRET');
      if (!secret) return null;

      const dotIndex = token.indexOf('.');
      if (dotIndex < 1) return null;

      const encodedPayload = token.slice(0, dotIndex);
      const receivedSig = token.slice(dotIndex + 1);

      if (!encodedPayload || !receivedSig) return null;

      const expectedSig = this.computeHmac(encodedPayload, secret);

      // Timing-safe comparison — both buffers must be the same length.
      const expected = Buffer.from(expectedSig, 'utf8');
      const received = Buffer.from(receivedSig, 'utf8');

      if (expected.length !== received.length) return null;
      if (!timingSafeEqual(expected, received)) return null;

      // HMAC is valid; now parse and validate the payload.
      const rawJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const payload = JSON.parse(rawJson) as unknown;

      if (!isReviewerPayload(payload)) return null;

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp <= nowSeconds) return null;

      return payload;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private requireSecret(): string {
    const s = this.config.get<string>('REVIEWER_SESSION_SECRET');
    if (!s) {
      throw new Error('REVIEWER_SESSION_SECRET is not configured');
    }
    return s;
  }

  private computeHmac(encodedPayload: string, secret: string): string {
    const message = `${ReviewerTokenService.PURPOSE}${encodedPayload}`;
    return createHmac('sha256', secret).update(message, 'utf8').digest('base64url');
  }
}

// ---------------------------------------------------------------------------
// Internal payload type
// ---------------------------------------------------------------------------

export interface ReviewerPayload {
  sub: string;
  exp: number;
}

function isReviewerPayload(value: unknown): value is ReviewerPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['sub'] === 'string' && typeof v['exp'] === 'number';
}
