import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * PendingConsultationTokenService
 *
 * Stateless HMAC-SHA256 token for public "schedule my pending session" links.
 *
 * Token format:
 *   base64url(pendingConsultationId) + '.' + base64url(HMAC_SHA256(secret, purpose + id))
 *
 * Purpose prefix: 'pending-consult:v1:'
 *   - Namespaces the signature away from other HMAC tokens produced with
 *     AUTH_RESOLVE_SECRET (appointment confirm, document sharing, etc.).
 *     A token forged for another purpose will fail verify() because the signed
 *     message will not match.
 *
 * Security:
 *   - Secret is validated at construction time (fail-fast on missing env var).
 *   - verify() uses timingSafeEqual to prevent timing-based token enumeration.
 *   - Any format or crypto error in verify() returns null (never throws).
 *   - Never logs the token, pendingId, or HMAC output.
 */
@Injectable()
export class PendingConsultationTokenService {
  private static readonly PURPOSE = 'pending-consult:v1:';

  private readonly secret: string;

  constructor(config: ConfigService) {
    const s = config.get<string>('AUTH_RESOLVE_SECRET');
    if (!s) {
      throw new Error('AUTH_RESOLVE_SECRET is not configured');
    }
    this.secret = s;
  }

  /**
   * Signs a pendingConsultationId and produces a URL-safe token.
   */
  sign(pendingId: string): string {
    const encodedId = Buffer.from(pendingId, 'utf8').toString('base64url');
    const sig = this.computeHmac(pendingId);
    return `${encodedId}.${sig}`;
  }

  /**
   * Verifies a token produced by sign() and returns the pendingConsultationId.
   * Returns null on any format or crypto error — never throws.
   */
  verify(token: string): string | null {
    try {
      const dotIndex = token.indexOf('.');
      if (dotIndex < 1) return null;

      const encodedId = token.slice(0, dotIndex);
      const receivedSig = token.slice(dotIndex + 1);

      if (!encodedId || !receivedSig) return null;

      const pendingId = Buffer.from(encodedId, 'base64url').toString('utf8');
      if (!pendingId) return null;

      const expectedSig = this.computeHmac(pendingId);

      const expected = Buffer.from(expectedSig, 'utf8');
      const received = Buffer.from(receivedSig, 'utf8');

      if (expected.length !== received.length) return null;
      if (!timingSafeEqual(expected, received)) return null;

      return pendingId;
    } catch {
      return null;
    }
  }

  private computeHmac(pendingId: string): string {
    const message = `${PendingConsultationTokenService.PURPOSE}${pendingId}`;
    return createHmac('sha256', this.secret).update(message, 'utf8').digest('base64url');
  }
}
