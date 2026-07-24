import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReviewerTokenService } from './reviewer-token.service';

const SECRET = 'test-reviewer-session-secret-32ch';
const PROFILE_ID = '00000000-0000-0000-0000-000000000001';

function makeModule(secret: string | undefined) {
  return Test.createTestingModule({
    providers: [
      ReviewerTokenService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => (key === 'REVIEWER_SESSION_SECRET' ? secret : undefined),
        },
      },
    ],
  }).compile();
}

describe('ReviewerTokenService', () => {
  let service: ReviewerTokenService;

  beforeEach(async () => {
    const module = await makeModule(SECRET);
    service = module.get(ReviewerTokenService);
  });

  // ---------------------------------------------------------------------------
  // Construction — no fail-fast at DI (secret is read lazily)
  // ---------------------------------------------------------------------------

  it('constructs without throwing even when secret is absent', async () => {
    // Unlike the appointment-confirm token service, the reviewer service does NOT
    // throw at construction — it reads the secret lazily so the app boots cleanly
    // when REVIEWER_ACCESS_ENABLED is off.
    await expect(makeModule(undefined)).resolves.toBeDefined();
  });

  it('constructs without throwing when secret is an empty string', async () => {
    await expect(makeModule('')).resolves.toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // mint — fail-fast on missing secret
  // ---------------------------------------------------------------------------

  it('mint throws when REVIEWER_SESSION_SECRET is absent', async () => {
    const module = await makeModule(undefined);
    const svc = module.get(ReviewerTokenService);
    expect(() => svc.mint(PROFILE_ID)).toThrow('REVIEWER_SESSION_SECRET is not configured');
  });

  it('mint throws when REVIEWER_SESSION_SECRET is an empty string', async () => {
    const module = await makeModule('');
    const svc = module.get(ReviewerTokenService);
    expect(() => svc.mint(PROFILE_ID)).toThrow('REVIEWER_SESSION_SECRET is not configured');
  });

  // ---------------------------------------------------------------------------
  // mint — shape and idempotency
  // ---------------------------------------------------------------------------

  it('mint returns a string with exactly one dot separator', () => {
    const token = service.mint(PROFILE_ID);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
  });

  it('mint produces a non-empty string', () => {
    const token = service.mint(PROFILE_ID);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  // ---------------------------------------------------------------------------
  // verify — happy path
  // ---------------------------------------------------------------------------

  it('verify returns the payload for a freshly minted token', () => {
    const token = service.mint(PROFILE_ID);
    const payload = service.verify(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(PROFILE_ID);
  });

  it('verify payload.exp is approximately 15 minutes from now', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = service.mint(PROFILE_ID);
    const after = Math.floor(Date.now() / 1000);

    const payload = service.verify(token);
    expect(payload).not.toBeNull();
    // exp should be in [before+900, after+900]
    expect(payload!.exp).toBeGreaterThanOrEqual(before + 900);
    expect(payload!.exp).toBeLessThanOrEqual(after + 900);
  });

  // ---------------------------------------------------------------------------
  // verify — returns null when secret is absent (no throw)
  // ---------------------------------------------------------------------------

  it('verify returns null (not throws) when REVIEWER_SESSION_SECRET is absent', async () => {
    const module = await makeModule(undefined);
    const svc = module.get(ReviewerTokenService);
    // Even with an otherwise-valid-looking token, null is returned safely
    const token = service.mint(PROFILE_ID); // minted with a different service that has a secret
    expect(svc.verify(token)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // verify — expired token
  // ---------------------------------------------------------------------------

  it('returns null for an expired token (exp in the past)', () => {
    const realDateNow = Date.now;
    try {
      // Set clock to 30 minutes ago so mint() sets exp = (now-30min) + 15min < real now
      Date.now = () => realDateNow() - 30 * 60 * 1000;
      const expiredToken = service.mint(PROFILE_ID);
      Date.now = realDateNow;

      expect(service.verify(expiredToken)).toBeNull();
    } finally {
      Date.now = realDateNow;
    }
  });

  // ---------------------------------------------------------------------------
  // verify — tampered tokens
  // ---------------------------------------------------------------------------

  it('returns null when the HMAC segment is tampered', () => {
    const token = service.mint(PROFILE_ID);
    const encodedPayload = token.split('.')[0];
    const tampered = `${encodedPayload}.invalidsignatureXXXXXXXXXXXXXXX`;
    expect(service.verify(tampered)).toBeNull();
  });

  it('returns null when the payload segment is tampered (HMAC mismatch)', () => {
    const token = service.mint(PROFILE_ID);
    const sig = token.split('.')[1];
    // Replace sub in payload with a different profileId
    const fakePayload = Buffer.from(
      JSON.stringify({ sub: 'evil-profile-id', exp: Math.floor(Date.now() / 1000) + 900 }),
      'utf8',
    ).toString('base64url');
    const tampered = `${fakePayload}.${sig}`;
    expect(service.verify(tampered)).toBeNull();
  });

  it('returns null when the token was minted with a different secret', async () => {
    const otherModule = await makeModule('completely-different-secret-xyz');
    const otherService = otherModule.get(ReviewerTokenService);

    const token = otherService.mint(PROFILE_ID);
    // Verify with original service (different secret) → null
    expect(service.verify(token)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // verify — malformed input
  // ---------------------------------------------------------------------------

  it('returns null for an empty string', () => {
    expect(service.verify('')).toBeNull();
  });

  it('returns null for a token with no dot', () => {
    expect(service.verify('nodothere')).toBeNull();
  });

  it('returns null for a bare dot', () => {
    expect(service.verify('.')).toBeNull();
  });

  it('returns null for random garbage', () => {
    expect(service.verify('!!!###$$$%%%')).toBeNull();
  });

  it('returns null for valid base64url payload but empty sig', () => {
    const encoded = Buffer.from('{"sub":"x","exp":9999999999}', 'utf8').toString('base64url');
    expect(service.verify(`${encoded}.`)).toBeNull();
  });

  it('returns null when JSON payload lacks required fields (HMAC mismatch regardless)', () => {
    const badPayload = Buffer.from('{"foo":"bar"}', 'utf8').toString('base64url');
    expect(service.verify(`${badPayload}.fakesig`)).toBeNull();
  });
});
