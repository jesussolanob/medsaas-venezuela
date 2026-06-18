import { DocumentAccessCode } from './document-access-code.entity';

const now = new Date('2026-06-18T12:00:00Z');
const future = new Date('2026-06-20T12:00:00Z'); // 48h later

const base = {
  id: 'code-1',
  linkId: 'link-1',
  code: '123456',
  expiresAt: future,
  usedAt: null,
  failedAttempts: 0,
  createdAt: now,
};

describe('DocumentAccessCode', () => {
  it('creates a code with factory method', () => {
    const code = DocumentAccessCode.create(base);
    expect(code.id).toBe('code-1');
    expect(code.code).toBe('123456');
  });

  describe('isNotExpired', () => {
    it('returns true when code has not expired', () => {
      const code = DocumentAccessCode.create(base);
      expect(code.isNotExpired(now)).toBe(true);
    });

    it('returns false when code has expired', () => {
      const expiredCode = DocumentAccessCode.create({
        ...base,
        expiresAt: new Date('2026-06-17T00:00:00Z'),
      });
      expect(expiredCode.isNotExpired(now)).toBe(false);
    });
  });

  describe('isNotUsed', () => {
    it('returns true when usedAt is null', () => {
      const code = DocumentAccessCode.create(base);
      expect(code.isNotUsed()).toBe(true);
    });

    it('returns false when usedAt is set', () => {
      const usedCode = DocumentAccessCode.create({ ...base, usedAt: new Date() });
      expect(usedCode.isNotUsed()).toBe(false);
    });
  });

  describe('isNotBlocked', () => {
    it('returns true when failedAttempts < MAX_FAILED_ATTEMPTS', () => {
      const code = DocumentAccessCode.create({ ...base, failedAttempts: 4 });
      expect(code.isNotBlocked()).toBe(true);
    });

    it('returns false when failedAttempts >= MAX_FAILED_ATTEMPTS', () => {
      const code = DocumentAccessCode.create({ ...base, failedAttempts: 5 });
      expect(code.isNotBlocked()).toBe(false);
    });
  });

  describe('isValidFor', () => {
    it('returns true when not expired, not used, not blocked', () => {
      const code = DocumentAccessCode.create(base);
      expect(code.isValidFor(now)).toBe(true);
    });

    it('returns false when expired', () => {
      const code = DocumentAccessCode.create({
        ...base,
        expiresAt: new Date('2026-06-17T00:00:00Z'),
      });
      expect(code.isValidFor(now)).toBe(false);
    });

    it('returns false when used', () => {
      const code = DocumentAccessCode.create({ ...base, usedAt: now });
      expect(code.isValidFor(now)).toBe(false);
    });

    it('returns false when blocked', () => {
      const code = DocumentAccessCode.create({ ...base, failedAttempts: 5 });
      expect(code.isValidFor(now)).toBe(false);
    });
  });

  describe('matches', () => {
    it('returns true for matching code', () => {
      const code = DocumentAccessCode.create(base);
      expect(code.matches('123456')).toBe(true);
    });

    it('returns false for non-matching code', () => {
      const code = DocumentAccessCode.create(base);
      expect(code.matches('999999')).toBe(false);
    });
  });
});
