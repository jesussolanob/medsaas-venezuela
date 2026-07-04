import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import { MissingHmacSecretError } from '../../domain/errors/missing-hmac-secret.error';

/**
 * PatientRequestSessionService — centralized HMAC sign/validate logic for
 * the patient-portal session token.
 *
 * Session token format: base64url(JSON payload) + "." + hex(HMAC-SHA256)
 * Payload: { requestId: string, token: string, exp: string (ISO) }
 *
 * SECURITY:
 *   - Requires AUTH_RESOLVE_SECRET (fallback: ENCRYPTION_HMAC_SECRET).
 *     Missing secret → MissingHmacSecretError (HTTP 500).
 *   - Signature uses HMAC-SHA256 with constant-time equality (timingSafeEqual).
 *   - Signing is intentionally not exposed as a public interface of use-cases —
 *     all crypto is encapsulated here to eliminate duplication.
 */
@Injectable()
export class PatientRequestSessionService {
  /** Session TTL: 15 minutes in milliseconds. */
  static readonly SESSION_TTL_MS = 15 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  /**
   * Signs a session token for a patient request.
   *
   * Called by VerifyPatientRequestCodeUseCase on successful verification.
   * The exp parameter is supplied by the caller (use-case owns the TTL policy).
   *
   * @throws {MissingHmacSecretError} when the signing secret is absent.
   */
  sign(requestId: string, token: string, exp: Date): string {
    const secret = this.resolveSecret();
    const payload = Buffer.from(
      JSON.stringify({ requestId, token, exp: exp.toISOString() }),
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }

  /**
   * Validates a session token previously issued by sign().
   *
   * Verifies: HMAC signature, expiry, requestId match, token match.
   * All failure modes produce the same InvalidSessionTokenError (oracle-safe).
   *
   * @throws {MissingHmacSecretError} when the signing secret is absent.
   * @throws {InvalidSessionTokenError} on any validation failure.
   */
  validate(sessionToken: string, expectedRequestId: string, expectedToken: string): void {
    const secret = this.resolveSecret();

    try {
      const parts = sessionToken.split('.');
      if (parts.length !== 2) throw new Error('malformed');
      const [payloadB64, sigHex] = parts as [string, string];

      const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
      const sigBuf = Buffer.from(sigHex, 'hex');
      const expectedSigBuf = Buffer.from(expectedSig, 'hex');

      if (sigBuf.length !== expectedSigBuf.length) throw new Error('invalid signature length');
      if (!crypto.timingSafeEqual(sigBuf, expectedSigBuf)) throw new Error('invalid signature');

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
        requestId: string;
        token: string;
        exp: string;
      };

      if (new Date(payload.exp) < new Date()) throw new Error('expired');
      if (payload.requestId !== expectedRequestId || payload.token !== expectedToken) {
        throw new Error('resource mismatch');
      }
    } catch (err) {
      if (err instanceof MissingHmacSecretError) throw err;
      throw new InvalidSessionTokenError();
    }
  }

  private resolveSecret(): string {
    const secret =
      this.config.get<string>('AUTH_RESOLVE_SECRET') ??
      this.config.get<string>('ENCRYPTION_HMAC_SECRET');

    if (!secret) {
      throw new MissingHmacSecretError();
    }

    return secret;
  }
}
