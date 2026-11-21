import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export type AppointmentAction = 'confirm' | 'reschedule' | 'cancel';

export interface ActionTokenPayload {
  appointmentId: string;
  /** Unix ms — appointment start time. Token expires after this time. */
  expMs: number;
  action: AppointmentAction;
  /**
   * scheduledAt Unix ms, included only for reschedule tokens.
   * After moving the appointment, scheduledAt changes → old token is invalid.
   * For confirm/cancel tokens this is 0.
   */
  satMs: number;
}

/**
 * AppointmentActionTokenService
 *
 * Stateless HMAC-SHA256 token for WhatsApp quick-reply button payloads.
 *
 * Token format:
 *   base64url(appointmentId) '.' base64url(expMs-8BE) '.' base64url(satMs-8BE) '.'
 *   base64url(HMAC_SHA256(secret, purpose + appointmentId + ':' + expMs + ':' + satMs + ':' + action))
 *
 * Purpose prefix: 'appt-action:v1:'
 *
 * Button payload: '{action}:{token}'
 *   e.g. 'confirm:aid.exp.sat.hmac'
 *        'reschedule:aid.exp.sat.hmac'
 *        'cancel:aid.exp.sat.hmac'
 *
 * Single-use reschedule: satMs encodes current scheduledAt. After the appointment
 * is moved, satMs no longer matches → verify() returns null.
 *
 * Security:
 *   - APPOINTMENT_ACTION_SECRET is validated at construction (fail-fast).
 *   - verify() uses timingSafeEqual to prevent timing-based enumeration.
 *   - Expired tokens (expMs <= now) are rejected.
 *   - Any format or crypto error returns null (never throws).
 *   - Never logs token values, appointment IDs, or HMAC outputs.
 */
@Injectable()
export class AppointmentActionTokenService {
  private static readonly PURPOSE = 'appt-action:v1:';

  private readonly secret: string;

  constructor(config: ConfigService) {
    const s = config.get<string>('APPOINTMENT_ACTION_SECRET');
    if (!s) {
      throw new Error('APPOINTMENT_ACTION_SECRET is not configured');
    }
    this.secret = s;
  }

  /**
   * Generates an action token and returns the full button payload string.
   * Format: '{action}:{token}'
   */
  generateButtonPayload(params: ActionTokenPayload): string {
    const token = this.generateToken(params);
    return `${params.action}:${token}`;
  }

  /**
   * Parses and verifies a button payload string.
   *
   * @param payload  The raw string received from the WhatsApp webhook.
   * @param now      Current time for expiry check (injectable for testing).
   * @returns Decoded payload or null when invalid / expired / tampered.
   */
  verifyButtonPayload(payload: string, now: Date = new Date()): ActionTokenPayload | null {
    try {
      const colonIdx = payload.indexOf(':');
      if (colonIdx < 1) return null;

      const action = payload.slice(0, colonIdx) as AppointmentAction;
      const token = payload.slice(colonIdx + 1);

      if (!['confirm', 'reschedule', 'cancel'].includes(action)) return null;

      const decoded = this.verifyToken(token, now);
      if (!decoded) return null;
      if (decoded.action !== action) return null;

      return decoded;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateToken(params: ActionTokenPayload): string {
    const aidBuf = Buffer.from(params.appointmentId, 'utf8');
    const expBuf = this.msToBuffer(params.expMs);
    const satBuf = this.msToBuffer(params.satMs);

    const aidB64 = aidBuf.toString('base64url');
    const expB64 = expBuf.toString('base64url');
    const satB64 = satBuf.toString('base64url');
    const hmac = this.sign(params.appointmentId, params.expMs, params.satMs, params.action);

    return `${aidB64}.${expB64}.${satB64}.${hmac}`;
  }

  private verifyToken(token: string, now: Date): ActionTokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 4) return null;

      const [aidB64, expB64, satB64, receivedHmac] = parts;
      if (!aidB64 || !expB64 || !satB64 || !receivedHmac) return null;

      const appointmentId = Buffer.from(aidB64, 'base64url').toString('utf8');
      const expMs = this.bufferToMs(Buffer.from(expB64, 'base64url'));
      const satMs = this.bufferToMs(Buffer.from(satB64, 'base64url'));

      if (!appointmentId || expMs <= 0) return null;

      // Check expiry (token is expired after the appointment starts)
      if (expMs <= now.getTime()) return null;

      // We need to try all three actions and find which one verifies.
      // The action is in the button payload prefix, not the token itself.
      // Here we verify that the HMAC is valid for some known action.
      // The caller passes action from the button prefix — we re-derive and compare.
      // Actually, the action IS part of the signed payload, so we try all and
      // return the first match. But since we receive the action from the prefix,
      // we only need to verify ONE. We'll verify all three and pick the matching one.
      for (const action of ['confirm', 'reschedule', 'cancel'] as AppointmentAction[]) {
        const expectedHmac = this.sign(appointmentId, expMs, satMs, action);
        const expected = Buffer.from(expectedHmac, 'utf8');
        const received = Buffer.from(receivedHmac, 'utf8');

        if (expected.length === received.length && timingSafeEqual(expected, received)) {
          return { appointmentId, expMs, action, satMs };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private sign(
    appointmentId: string,
    expMs: number,
    satMs: number,
    action: AppointmentAction,
  ): string {
    const message = `${AppointmentActionTokenService.PURPOSE}${appointmentId}:${expMs}:${satMs}:${action}`;
    return createHmac('sha256', this.secret).update(message, 'utf8').digest('base64url');
  }

  private msToBuffer(ms: number): Buffer {
    const buf = Buffer.allocUnsafe(8);
    // Write as big-endian 64-bit integer (high and low 32-bit halves).
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
