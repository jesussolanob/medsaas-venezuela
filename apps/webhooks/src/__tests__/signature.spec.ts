import { createHmac } from 'node:crypto';
import { verifyZernioSignature } from '../lib/signature';

const SECRET = 'test-secret-key-32-bytes-long!!';

function hmac(body: Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyZernioSignature', () => {
  const body = Buffer.from('{"id":"evt-123","event":"message.received"}');

  it('returns true for a valid hex signature', () => {
    expect(verifyZernioSignature(body, hmac(body), SECRET)).toBe(true);
  });

  it('returns true for a valid sha256= prefixed signature', () => {
    expect(verifyZernioSignature(body, `sha256=${hmac(body)}`, SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyZernioSignature(body, 'deadbeef', SECRET)).toBe(false);
  });

  it('returns false when signature header is undefined', () => {
    expect(verifyZernioSignature(body, undefined, SECRET)).toBe(false);
  });

  it('returns false when the body differs from what was signed', () => {
    const differentBody = Buffer.from('{"id":"other"}');
    expect(verifyZernioSignature(body, hmac(differentBody), SECRET)).toBe(false);
  });

  it('returns false when the wrong secret is used', () => {
    expect(verifyZernioSignature(body, hmac(body, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('returns false for an empty string header', () => {
    expect(verifyZernioSignature(body, '', SECRET)).toBe(false);
  });
});
