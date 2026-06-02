import { ConsultationCode } from './consultation-code.vo';

describe('ConsultationCode', () => {
  describe('generate', () => {
    it('produces the DLT-YYYYMM-XXXX format', () => {
      const date = new Date('2026-06-15T00:00:00Z');
      const code = ConsultationCode.generate(date, 42);
      expect(code.value).toBe('DLT-202606-0042');
    });

    it('zero-pads the sequence number to 4 digits', () => {
      const date = new Date('2026-01-01T00:00:00Z');
      expect(ConsultationCode.generate(date, 1).value).toBe('DLT-202601-0001');
      expect(ConsultationCode.generate(date, 9).value).toBe('DLT-202601-0009');
      expect(ConsultationCode.generate(date, 99).value).toBe('DLT-202601-0099');
      expect(ConsultationCode.generate(date, 999).value).toBe('DLT-202601-0999');
    });

    it('handles sequence numbers > 9999 without truncation', () => {
      const date = new Date('2026-06-01T00:00:00Z');
      // Sequence exceeding 4 digits should still produce a valid string
      const code = ConsultationCode.generate(date, 10000);
      expect(code.value).toBe('DLT-202606-10000');
    });

    it('uses UTC month correctly', () => {
      // December UTC
      const date = new Date('2026-12-31T23:59:59Z');
      const code = ConsultationCode.generate(date, 1);
      expect(code.value).toBe('DLT-202612-0001');
    });

    it('returns a ConsultationCode instance', () => {
      const code = ConsultationCode.generate(new Date(), 1);
      expect(code).toBeInstanceOf(ConsultationCode);
    });

    it('toString returns the value', () => {
      const code = ConsultationCode.generate(new Date('2026-06-01T00:00:00Z'), 7);
      expect(code.toString()).toBe(code.value);
    });
  });

  describe('isValid', () => {
    it('accepts valid DLT-YYYYMM-XXXX codes (4-digit sequences)', () => {
      expect(ConsultationCode.isValid('DLT-202606-0001')).toBe(true);
      expect(ConsultationCode.isValid('DLT-202601-9999')).toBe(true);
      expect(ConsultationCode.isValid('DLT-202612-0042')).toBe(true);
    });

    it('accepts 5+ digit sequences (generated when sequence >= 10000)', () => {
      // generate() does not truncate sequences >= 10000, so isValid must accept them.
      expect(ConsultationCode.isValid('DLT-202606-10000')).toBe(true);
      expect(ConsultationCode.isValid('DLT-202606-99999')).toBe(true);
    });

    it('rejects malformed codes', () => {
      expect(ConsultationCode.isValid('CON-202606-0001')).toBe(false);
      expect(ConsultationCode.isValid('DLT-20260-0001')).toBe(false);
      // 3-digit sequence (below minimum)
      expect(ConsultationCode.isValid('DLT-202606-001')).toBe(false);
      expect(ConsultationCode.isValid('dlt-202606-0001')).toBe(false);
      expect(ConsultationCode.isValid('')).toBe(false);
      expect(ConsultationCode.isValid('DLT-202606-0001-extra')).toBe(false);
    });
  });
});
