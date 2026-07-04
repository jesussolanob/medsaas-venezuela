import { PatientRequestAccessCode } from './patient-request-access-code.entity';

const makeCode = (
  overrides: Partial<{
    code: string;
    expiresAt: Date;
    usedAt: Date | null;
    failedAttempts: number;
  }> = {},
): PatientRequestAccessCode =>
  PatientRequestAccessCode.create({
    id: 'code-1',
    requestId: 'req-1',
    code: overrides.code ?? '123456',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: overrides.usedAt !== undefined ? overrides.usedAt : null,
    failedAttempts: overrides.failedAttempts ?? 0,
    createdAt: new Date(),
  });

describe('PatientRequestAccessCode entity', () => {
  const now = new Date();

  describe('isNotExpired()', () => {
    it('returns true when expiresAt is in the future', () => {
      expect(makeCode().isNotExpired(now)).toBe(true);
    });

    it('returns false when expiresAt is in the past', () => {
      expect(makeCode({ expiresAt: new Date('2020-01-01') }).isNotExpired(now)).toBe(false);
    });
  });

  describe('isNotUsed()', () => {
    it('returns true when usedAt is null', () => {
      expect(makeCode({ usedAt: null }).isNotUsed()).toBe(true);
    });

    it('returns false when usedAt is set', () => {
      expect(makeCode({ usedAt: new Date() }).isNotUsed()).toBe(false);
    });
  });

  describe('isNotBlocked()', () => {
    it('returns true when failed attempts is below threshold (5)', () => {
      expect(makeCode({ failedAttempts: 4 }).isNotBlocked()).toBe(true);
    });

    it('returns false when failed attempts equals threshold', () => {
      expect(makeCode({ failedAttempts: 5 }).isNotBlocked()).toBe(false);
    });
  });

  describe('isValidFor()', () => {
    it('returns true when not expired, not used, not blocked', () => {
      expect(makeCode().isValidFor(now)).toBe(true);
    });

    it('returns false when expired', () => {
      expect(makeCode({ expiresAt: new Date('2020-01-01') }).isValidFor(now)).toBe(false);
    });

    it('returns false when used', () => {
      expect(makeCode({ usedAt: new Date() }).isValidFor(now)).toBe(false);
    });

    it('returns false when blocked', () => {
      expect(makeCode({ failedAttempts: 5 }).isValidFor(now)).toBe(false);
    });
  });

  describe('matches()', () => {
    it('returns true when code matches', () => {
      expect(makeCode({ code: '654321' }).matches('654321')).toBe(true);
    });

    it('returns false when code does not match', () => {
      expect(makeCode({ code: '654321' }).matches('000000')).toBe(false);
    });
  });
});
