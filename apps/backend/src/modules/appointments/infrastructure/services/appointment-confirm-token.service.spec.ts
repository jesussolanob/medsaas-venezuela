import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppointmentConfirmTokenService } from './appointment-confirm-token.service';

describe('AppointmentConfirmTokenService', () => {
  let service: AppointmentConfirmTokenService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AppointmentConfirmTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'AUTH_RESOLVE_SECRET' ? 'test-secret-value' : undefined),
          },
        },
      ],
    }).compile();

    service = module.get(AppointmentConfirmTokenService);
  });

  // -------------------------------------------------------------------------
  // generate + verify — happy path
  // -------------------------------------------------------------------------

  it('generates a token with two base64url segments separated by a dot', () => {
    const token = service.generate('appointment-uuid-123');
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
  });

  it('verify returns the appointmentId for a valid token', () => {
    const appointmentId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const token = service.generate(appointmentId);
    expect(service.verify(token)).toBe(appointmentId);
  });

  it('generate + verify round-trips with a UUID containing hyphens', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    const token = service.generate(id);
    expect(service.verify(token)).toBe(id);
  });

  // -------------------------------------------------------------------------
  // verify — tampered HMAC
  // -------------------------------------------------------------------------

  it('returns null when the HMAC segment is altered', () => {
    const token = service.generate('some-appointment-id');
    const [encodedId] = token.split('.');
    const tamperedToken = `${encodedId}.invalidsignatureXXXXX`;
    expect(service.verify(tamperedToken)).toBeNull();
  });

  it('returns null when the id segment is altered but signature stays', () => {
    const token = service.generate('original-id');
    const parts = token.split('.');
    const alteredId = Buffer.from('different-id', 'utf8').toString('base64url');
    const tamperedToken = `${alteredId}.${parts[1]}`;
    expect(service.verify(tamperedToken)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // verify — malformed input
  // -------------------------------------------------------------------------

  it('returns null for an empty string', () => {
    expect(service.verify('')).toBeNull();
  });

  it('returns null for a token with no dot', () => {
    expect(service.verify('nodotinhere')).toBeNull();
  });

  it('returns null for a token that is just a dot', () => {
    expect(service.verify('.')).toBeNull();
  });

  it('returns null for a token with only the id segment', () => {
    const encodedId = Buffer.from('my-id', 'utf8').toString('base64url');
    expect(service.verify(`${encodedId}.`)).toBeNull();
  });

  it('returns null for random garbage input', () => {
    expect(service.verify('!!!###$$$%%%')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // verify — wrong secret
  // -------------------------------------------------------------------------

  it('returns null when the token was signed with a different secret', async () => {
    const otherModule = await Test.createTestingModule({
      providers: [
        AppointmentConfirmTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'AUTH_RESOLVE_SECRET' ? 'different-secret-value' : undefined,
          },
        },
      ],
    }).compile();

    const other = otherModule.get(AppointmentConfirmTokenService);
    const token = other.generate('appointment-id-xyz');
    // Verify with original service (different secret) → null
    expect(service.verify(token)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Idempotency — same input always same token
  // -------------------------------------------------------------------------

  it('produces the same token for the same appointmentId', () => {
    const id = 'stable-id-123';
    expect(service.generate(id)).toBe(service.generate(id));
  });

  // -------------------------------------------------------------------------
  // Fail-fast — missing secret
  // -------------------------------------------------------------------------

  it('throws at construction when AUTH_RESOLVE_SECRET is absent', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          AppointmentConfirmTokenService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile(),
    ).rejects.toThrow('AUTH_RESOLVE_SECRET is not configured');
  });

  it('throws at construction when AUTH_RESOLVE_SECRET is an empty string', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          AppointmentConfirmTokenService,
          {
            provide: ConfigService,
            useValue: { get: () => '' },
          },
        ],
      }).compile(),
    ).rejects.toThrow('AUTH_RESOLVE_SECRET is not configured');
  });
});
