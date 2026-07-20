import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * AppointmentConfirmTokenService
 *
 * Stateless HMAC-SHA256 token for public appointment confirmation links.
 *
 * Token format:
 *   base64url(appointmentId) + '.' + base64url(HMAC_SHA256(secret, purpose + appointmentId))
 *
 * Purpose prefix: 'appt-confirm:v1:'
 *   - Namespaces the signature away from any other HMAC tokens produced with
 *     AUTH_RESOLVE_SECRET (e.g. document sharing). A token forged for another
 *     purpose will fail verify() because the signed message will not match.
 *
 * No expiration — confirming a terminal appointment is a non-fatal no-op.
 *
 * Security:
 *   - Secret is validated at construction time (fail-fast). An empty or absent
 *     AUTH_RESOLVE_SECRET throws immediately so the service never runs with a
 *     deterministic / forgeable HMAC.
 *   - verify() uses timingSafeEqual to prevent timing-based token enumeration.
 *   - Any format or crypto error in verify() returns null (never throws to the
 *     caller). The secret-missing case cannot arise at runtime because the
 *     constructor would have already thrown.
 *   - Never logs the token, appointmentId, or HMAC output.
 */
@Injectable()
export class AppointmentConfirmTokenService {
  private static readonly PURPOSE = 'appt-confirm:v1:';

  private readonly secret: string;

  constructor(config: ConfigService) {
    const s = config.get<string>('AUTH_RESOLVE_SECRET');
    if (!s) {
      throw new Error('AUTH_RESOLVE_SECRET is not configured');
    }
    this.secret = s;
  }

  /**
   * Generates a stateless confirmation token for the given appointmentId.
   *
   * @param appointmentId UUID of the appointment to confirm.
   * @returns URL-safe base64 token.
   */
  generate(appointmentId: string): string {
    const encodedId = Buffer.from(appointmentId, 'utf8').toString('base64url');
    const sig = this.sign(appointmentId);
    return `${encodedId}.${sig}`;
  }

  /**
   * Verifies a token and extracts the appointmentId.
   *
   * @param token Token produced by generate().
   * @returns The appointmentId if the HMAC validates; null otherwise.
   *          Returns null on any format or crypto error — never throws.
   */
  verify(token: string): string | null {
    try {
      const dotIndex = token.indexOf('.');
      if (dotIndex < 1) return null;

      const encodedId = token.slice(0, dotIndex);
      const receivedSig = token.slice(dotIndex + 1);

      if (!encodedId || !receivedSig) return null;

      const appointmentId = Buffer.from(encodedId, 'base64url').toString('utf8');
      if (!appointmentId) return null;

      const expectedSig = this.sign(appointmentId);

      // Timing-safe comparison — buffers must be equal length for timingSafeEqual.
      const expected = Buffer.from(expectedSig, 'utf8');
      const received = Buffer.from(receivedSig, 'utf8');

      if (expected.length !== received.length) return null;
      if (!timingSafeEqual(expected, received)) return null;

      return appointmentId;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sign(appointmentId: string): string {
    const message = `${AppointmentConfirmTokenService.PURPOSE}${appointmentId}`;
    return createHmac('sha256', this.secret).update(message, 'utf8').digest('base64url');
  }
}
