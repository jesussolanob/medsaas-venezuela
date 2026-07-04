import { ConfigService } from '@nestjs/config';
import { PatientRequestSessionService } from './patient-request-session.service';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import { MissingHmacSecretError } from '../../domain/errors/missing-hmac-secret.error';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_RESOLVE_SECRET') return TEST_SECRET;
    return undefined;
  }),
} as unknown as ConfigService;

const mockConfigNoSecret = {
  get: jest.fn(() => undefined),
} as unknown as ConfigService;

describe('PatientRequestSessionService', () => {
  let service: PatientRequestSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PatientRequestSessionService(mockConfig);
  });

  // ---------------------------------------------------------------------------
  // sign()
  // ---------------------------------------------------------------------------

  describe('sign()', () => {
    it('produces a token in payload.sig format', () => {
      const exp = new Date(Date.now() + 15 * 60 * 1000);
      const token = service.sign('req-1', 'tok-abc', exp);

      expect(token).toContain('.');
      const [payloadB64, sigHex] = token.split('.');
      expect(sigHex).toHaveLength(64); // 32-byte HMAC hex
      const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
      expect(payload.requestId).toBe('req-1');
      expect(payload.token).toBe('tok-abc');
    });

    it('throws MissingHmacSecretError when secret is absent', () => {
      const noSecretService = new PatientRequestSessionService(mockConfigNoSecret);
      expect(() => noSecretService.sign('req-1', 'tok', new Date())).toThrow(
        MissingHmacSecretError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // validate()
  // ---------------------------------------------------------------------------

  describe('validate()', () => {
    it('does not throw for a valid token signed by sign()', () => {
      const exp = new Date(Date.now() + 15 * 60 * 1000);
      const token = service.sign('req-1', 'tok-abc', exp);
      expect(() => service.validate(token, 'req-1', 'tok-abc')).not.toThrow();
    });

    it('throws InvalidSessionTokenError for a malformed token (no dot)', () => {
      expect(() => service.validate('noDotsHere', 'req-1', 'tok')).toThrow(
        InvalidSessionTokenError,
      );
    });

    it('throws InvalidSessionTokenError when signature is wrong', () => {
      const exp = new Date(Date.now() + 15 * 60 * 1000);
      const token = service.sign('req-1', 'tok-abc', exp);
      const tampered = token.replace(/.$/, '0'); // flip last hex char
      expect(() => service.validate(tampered, 'req-1', 'tok-abc')).toThrow(
        InvalidSessionTokenError,
      );
    });

    it('throws InvalidSessionTokenError when token is expired', () => {
      const pastExp = new Date(Date.now() - 1000); // 1 second ago
      const token = service.sign('req-1', 'tok-abc', pastExp);
      expect(() => service.validate(token, 'req-1', 'tok-abc')).toThrow(InvalidSessionTokenError);
    });

    it('throws InvalidSessionTokenError when requestId does not match', () => {
      const exp = new Date(Date.now() + 15 * 60 * 1000);
      const token = service.sign('req-1', 'tok-abc', exp);
      expect(() => service.validate(token, 'req-OTHER', 'tok-abc')).toThrow(
        InvalidSessionTokenError,
      );
    });

    it('throws InvalidSessionTokenError when token field does not match', () => {
      const exp = new Date(Date.now() + 15 * 60 * 1000);
      const token = service.sign('req-1', 'tok-abc', exp);
      expect(() => service.validate(token, 'req-1', 'tok-DIFFERENT')).toThrow(
        InvalidSessionTokenError,
      );
    });

    it('throws MissingHmacSecretError when secret is absent', () => {
      const noSecretService = new PatientRequestSessionService(mockConfigNoSecret);
      expect(() => noSecretService.validate('any.token', 'req-1', 'tok')).toThrow(
        MissingHmacSecretError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // round-trip
  // ---------------------------------------------------------------------------

  it('sign then validate round-trip succeeds', () => {
    const exp = new Date(Date.now() + 60_000);
    const token = service.sign('req-xyz', 'link-token', exp);
    expect(() => service.validate(token, 'req-xyz', 'link-token')).not.toThrow();
  });
});
