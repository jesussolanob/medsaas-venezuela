import { PendingConsultationTokenService } from './pending-consultation-token.service';
import type { ConfigService } from '@nestjs/config';

function makeService(secret = 'test-secret-32-bytes-long-minimum') {
  const config = {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
  return new PendingConsultationTokenService(config);
}

describe('PendingConsultationTokenService', () => {
  it('throws when AUTH_RESOLVE_SECRET is not configured', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    expect(() => new PendingConsultationTokenService(config)).toThrow(
      'AUTH_RESOLVE_SECRET is not configured',
    );
  });

  describe('sign() + verify()', () => {
    it('round-trips the pendingId through sign and verify', () => {
      const service = makeService();
      const id = '550e8400-e29b-41d4-a716-446655440000';

      const token = service.sign(id);
      const result = service.verify(token);

      expect(result).toBe(id);
    });

    it('returns null for a tampered token', () => {
      const service = makeService();
      const id = 'some-uuid';

      const token = service.sign(id);
      const tampered = token.slice(0, -4) + 'XXXX';

      expect(service.verify(tampered)).toBeNull();
    });

    it('returns null for a token from a different secret', () => {
      const signer = makeService('secret-A-32-bytes-long----------');
      const verifier = makeService('secret-B-32-bytes-long---------');

      const token = signer.sign('my-id');
      expect(verifier.verify(token)).toBeNull();
    });

    it('returns null for an empty string', () => {
      const service = makeService();
      expect(service.verify('')).toBeNull();
    });

    it('returns null for a malformed token with no dot separator', () => {
      const service = makeService();
      expect(service.verify('nodotsatall')).toBeNull();
    });

    it('returns null for a token with an empty payload segment', () => {
      const service = makeService();
      expect(service.verify('.some-sig')).toBeNull();
    });

    it('produces tokens that differ for different pendingIds', () => {
      const service = makeService();
      const t1 = service.sign('id-1');
      const t2 = service.sign('id-2');
      expect(t1).not.toBe(t2);
    });

    it('is deterministic: same id produces the same token', () => {
      const service = makeService();
      const id = 'deterministic-id';
      expect(service.sign(id)).toBe(service.sign(id));
    });
  });
});
