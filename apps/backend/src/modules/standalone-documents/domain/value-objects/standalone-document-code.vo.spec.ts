import { StandaloneDocumentCode } from './standalone-document-code.vo';

describe('StandaloneDocumentCode', () => {
  describe('generate', () => {
    it('generates a REC code with correct format', () => {
      const date = new Date('2026-10-15T10:00:00Z');
      const code = StandaloneDocumentCode.generate('REC', date, 42);
      expect(code.value).toBe('REC-202610-0042');
    });

    it('generates a PAR code', () => {
      const date = new Date('2026-10-15T10:00:00Z');
      const code = StandaloneDocumentCode.generate('PAR', date, 1);
      expect(code.value).toBe('PAR-202610-0001');
    });

    it('generates a REP code', () => {
      const date = new Date('2026-10-15T10:00:00Z');
      const code = StandaloneDocumentCode.generate('REP', date, 9999);
      expect(code.value).toBe('REP-202610-9999');
    });

    it('does not truncate sequences >= 10000', () => {
      const date = new Date('2026-10-15T10:00:00Z');
      const code = StandaloneDocumentCode.generate('REC', date, 10000);
      expect(code.value).toBe('REC-202610-10000');
    });

    /**
     * Caracas timezone boundary test:
     * 2026-11-01T02:30:00Z = 2026-10-31T22:30:00 Caracas (UTC-4)
     * So month in Caracas is October (202610), not November (202611).
     */
    it('uses Caracas month (UTC-4) — date is October in Caracas, November in UTC', () => {
      // 2026-11-01T02:30:00Z → in Caracas is 2026-10-31T22:30:00, so month = 202610
      const date = new Date('2026-11-01T02:30:00Z');
      const code = StandaloneDocumentCode.generate('REC', date, 1);
      expect(code.value).toBe('REC-202610-0001');
    });

    it('uses November month when date is in November Caracas time', () => {
      // 2026-11-01T05:00:00Z → in Caracas is 2026-11-01T01:00:00, so month = 202611
      const date = new Date('2026-11-01T05:00:00Z');
      const code = StandaloneDocumentCode.generate('REC', date, 1);
      expect(code.value).toBe('REC-202611-0001');
    });
  });

  describe('toCaracasYearMonth', () => {
    it('returns YYYYMM based on Caracas time', () => {
      const date = new Date('2026-10-15T10:00:00Z');
      expect(StandaloneDocumentCode.toCaracasYearMonth(date)).toBe('202610');
    });

    it('handles timezone boundary correctly (Oct in Caracas, Nov UTC)', () => {
      const date = new Date('2026-11-01T02:30:00Z');
      expect(StandaloneDocumentCode.toCaracasYearMonth(date)).toBe('202610');
    });
  });

  describe('isValid', () => {
    it('returns true for valid REC code', () => {
      expect(StandaloneDocumentCode.isValid('REC-202610-0001')).toBe(true);
    });

    it('returns true for valid PAR code', () => {
      expect(StandaloneDocumentCode.isValid('PAR-202610-0042')).toBe(true);
    });

    it('returns true for valid REP code with 5+ digit sequence', () => {
      expect(StandaloneDocumentCode.isValid('REP-202610-10000')).toBe(true);
    });

    it('returns false for wrong prefix', () => {
      expect(StandaloneDocumentCode.isValid('DLT-202610-0001')).toBe(false);
    });

    it('returns false for missing segment', () => {
      expect(StandaloneDocumentCode.isValid('REC-202610')).toBe(false);
    });

    it('returns false for sequence with fewer than 4 digits', () => {
      expect(StandaloneDocumentCode.isValid('REC-202610-001')).toBe(false);
    });
  });
});
