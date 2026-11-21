import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface RescheduleTokenPayload {
  appointmentId: string;
  /**
   * scheduledAt Unix ms at token generation time.
   * After the appointment is moved, satMs no longer matches → token is stale
   * and verify() returns null (single-use guarantee).
   */
  satMs: number;
}

/**
 * AppointmentRescheduleTokenService
 *
 * Stateless HMAC-SHA256 token for public reschedule URL links.
 *
 * Token format:
 *   base64url(appointmentId) '.' base64url(satMs-8BE) '.' base64url(HMAC_SHA256(secret, purpose + appointmentId + ':' + satMs))
 *
 * Purpose prefix: 'appt-reschedule:v1:'
 *
 * Single-use: satMs encodes scheduledAt at generation time.
 * After the appointment is rescheduled, scheduledAt changes → the satMs in the
 * token no longer matches → verify() returns null.
 *
 * Security:
 *   - APPOINTMENT_ACTION_SECRET is validated at construction (fail-fast).
 *   - verify() uses timingSafeEqual to prevent timing-based enumeration.
 *   - Any format or crypto error returns null (never throws).
 *   - Never logs token values, appointment IDs, or HMAC outputs.
 */
@Injectable()
export class AppointmentRescheduleTokenService {
  private static readonly PURPOSE = 'appt-reschedule:v1:';

  private readonly secret: string;

  constructor(config: ConfigService) {
    const s = config.get<string>('APPOINTMENT_ACTION_SECRET');
    if (!s) {
      throw new Error('APPOINTMENT_ACTION_SECRET is not configured');
    }
    this.secret = s;
  }

  /**
   * Generates a stateless reschedule token.
   *
   * @param params  appointmentId and current scheduledAt (as Unix ms).
   * @returns URL-safe base64 token.
   */
  generate(params: RescheduleTokenPayload): string {
    const aidBuf = Buffer.from(params.appointmentId, 'utf8').toString('base64url');
    const satBuf = this.msToBuffer(params.satMs).toString('base64url');
    const sig = this.sign(params.appointmentId, params.satMs);
    return `${aidBuf}.${satBuf}.${sig}`;
  }

  /**
   * Verifies a reschedule token.
   *
   * @param token Token produced by generate().
   * @returns Decoded payload if the HMAC validates; null if invalid/stale/tampered.
   *          Returns null on any format or crypto error — never throws.
   */
  verify(token: string): RescheduleTokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [aidB64, satB64, receivedSig] = parts;
      if (!aidB64 || !satB64 || !receivedSig) return null;

      const appointmentId = Buffer.from(aidB64, 'base64url').toString('utf8');
      if (!appointmentId) return null;

      const satMs = this.bufferToMs(Buffer.from(satB64, 'base64url'));
      if (satMs <= 0) return null;

      const expectedSig = this.sign(appointmentId, satMs);

      const expected = Buffer.from(expectedSig, 'utf8');
      const received = Buffer.from(receivedSig, 'utf8');

      if (expected.length !== received.length) return null;
      if (!timingSafeEqual(expected, received)) return null;

      return { appointmentId, satMs };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sign(appointmentId: string, satMs: number): string {
    const message = `${AppointmentRescheduleTokenService.PURPOSE}${appointmentId}:${satMs}`;
    return createHmac('sha256', this.secret).update(message, 'utf8').digest('base64url');
  }

  private msToBuffer(ms: number): Buffer {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(Math.floor(ms / 0x100000000), 0);
    buf.writeUInt32BE(ms >>> 0, 4);
    return buf;
  }

  private bufferToMs(buf: Buffer): number {
    if (buf.length !== 8) return 0;
    const high = buf.readUInt32BE(0);
    const low = buf.readUInt32BE(4);
    return high * 0x100000000 + low;
  }
}
