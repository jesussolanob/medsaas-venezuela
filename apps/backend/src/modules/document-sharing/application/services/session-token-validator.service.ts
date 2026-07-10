import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import { MissingHmacSecretError } from '../../domain/errors/missing-hmac-secret.error';

/**
 * SessionTokenValidatorService
 *
 * Shared application service that validates HMAC session tokens issued by
 * VerifyCodeUseCase.signSessionToken.
 *
 * Token format: base64url(payload) . hex(HMAC-SHA256(payload, secret))
 * Payload:      { linkId, token, exp }
 *
 * SECURITY:
 *   - AUTH_RESOLVE_SECRET is mandatory. If absent, MissingHmacSecretError is thrown
 *     (never falls back to a weak default so ops can detect misconfiguration).
 *   - Signature verification uses timingSafeEqual to prevent timing attacks.
 *   - Never log the session token or its payload.
 *
 * Extracted from DownloadDocumentUseCase so multiple use cases can share the
 * same validation logic without duplication.
 */
@Injectable()
export class SessionTokenValidatorService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Validates a session token.
   *
   * Performs in order:
   *   1. Presence check (empty → InvalidSessionTokenError).
   *   2. HMAC signature verification (constant-time).
   *   3. Expiry check.
   *   4. Resource match: linkId and token must equal the expected values.
   *
   * @throws {MissingHmacSecretError} when AUTH_RESOLVE_SECRET is absent.
   * @throws {InvalidSessionTokenError} on any validation failure.
   */
  validate(sessionToken: string, expectedLinkId: string, expectedToken: string): void {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new InvalidSessionTokenError();
    }

    const secret =
      this.config.get<string>('AUTH_RESOLVE_SECRET') ??
      this.config.get<string>('ENCRYPTION_HMAC_SECRET');

    if (!secret) {
      throw new MissingHmacSecretError();
    }

    try {
      const parts = sessionToken.split('.');
      if (parts.length !== 2) {
        throw new Error('malformed');
      }
      const [payloadB64, sigHex] = parts as [string, string];

      // Constant-time HMAC comparison
      const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
      const sigBuf = Buffer.from(sigHex, 'hex');
      const expectedSigBuf = Buffer.from(expectedSig, 'hex');

      if (sigBuf.length !== expectedSigBuf.length) {
        throw new Error('invalid signature length');
      }
      if (!crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
        throw new Error('invalid signature');
      }

      // Decode and validate payload
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
        linkId: string;
        token: string;
        exp: string;
      };

      if (new Date(payload.exp) < new Date()) {
        throw new Error('expired');
      }

      if (payload.linkId !== expectedLinkId || payload.token !== expectedToken) {
        throw new Error('resource mismatch');
      }
    } catch (err) {
      if (err instanceof MissingHmacSecretError) throw err;
      throw new InvalidSessionTokenError();
    }
  }
}
