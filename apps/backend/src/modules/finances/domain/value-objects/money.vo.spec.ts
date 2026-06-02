import { Money } from './money.vo';
import { CurrencyMismatchError } from '../errors/currency-mismatch.error';
import { InvalidAmountError } from '../errors/invalid-amount.error';

describe('Money', () => {
  describe('constructor', () => {
    it('creates a valid USD money value', () => {
      const m = new Money(100, 'USD');
      expect(m.amount).toBe(100);
      expect(m.currency).toBe('USD');
    });

    it('creates a valid BS money value', () => {
      const m = new Money(3600, 'BS');
      expect(m.amount).toBe(3600);
      expect(m.currency).toBe('BS');
    });

    it('allows zero amount (used in net calculations after sum)', () => {
      // Zero is allowed at the VO level; use cases enforce > 0 for individual entries.
      const m = new Money(0, 'USD');
      expect(m.amount).toBe(0);
    });

    it('throws InvalidAmountError for negative amount', () => {
      expect(() => new Money(-1, 'USD')).toThrow(InvalidAmountError);
    });

    it('throws InvalidAmountError with the offending amount', () => {
      expect(() => new Money(-50, 'USD')).toThrow('received -50');
    });
  });

  describe('toUSD', () => {
    it('converts BS to USD correctly', () => {
      const bs = new Money(3600, 'BS');
      const usd = bs.toUSD(36);
      expect(usd.currency).toBe('USD');
      expect(usd.amount).toBeCloseTo(100, 5);
    });

    it('returns this when already in USD', () => {
      const usd = new Money(100, 'USD');
      expect(usd.toUSD(36)).toBe(usd);
    });
  });

  describe('toBS', () => {
    it('converts USD to BS correctly', () => {
      const usd = new Money(100, 'USD');
      const bs = usd.toBS(36);
      expect(bs.currency).toBe('BS');
      expect(bs.amount).toBe(3600);
    });

    it('returns this when already in BS', () => {
      const bs = new Money(3600, 'BS');
      expect(bs.toBS(36)).toBe(bs);
    });
  });

  describe('add', () => {
    it('adds same-currency USD amounts', () => {
      const a = new Money(100, 'USD');
      const b = new Money(50, 'USD');
      const result = a.add(b);
      expect(result.amount).toBe(150);
      expect(result.currency).toBe('USD');
    });

    it('adds same-currency BS amounts', () => {
      const a = new Money(1000, 'BS');
      const b = new Money(500, 'BS');
      const result = a.add(b);
      expect(result.amount).toBe(1500);
      expect(result.currency).toBe('BS');
    });

    it('throws CurrencyMismatchError for different currencies', () => {
      const usd = new Money(100, 'USD');
      const bs = new Money(100, 'BS');
      expect(() => usd.add(bs)).toThrow(CurrencyMismatchError);
    });

    it('returns a new Money instance (immutability)', () => {
      const a = new Money(100, 'USD');
      const b = new Money(50, 'USD');
      const result = a.add(b);
      expect(result).not.toBe(a);
      expect(result).not.toBe(b);
      expect(a.amount).toBe(100); // original unchanged
    });
  });

  describe('subtract', () => {
    it('subtracts same-currency amounts when result is non-negative', () => {
      const a = new Money(100, 'USD');
      const b = new Money(30, 'USD');
      const result = a.subtract(b);
      expect(result.amount).toBe(70);
      expect(result.currency).toBe('USD');
    });

    it('allows subtraction that results in exactly zero', () => {
      const a = new Money(50, 'USD');
      const b = new Money(50, 'USD');
      const result = a.subtract(b);
      expect(result.amount).toBe(0);
    });

    it('throws InvalidAmountError when subtraction would produce a negative amount', () => {
      // Money cannot represent negative magnitudes. Callers that need a signed
      // deficit (e.g. GetFinancialSummaryUseCase) compute net as a plain number.
      const a = new Money(10, 'USD');
      const b = new Money(50, 'USD');
      expect(() => a.subtract(b)).toThrow(InvalidAmountError);
    });

    it('throws CurrencyMismatchError for different currencies', () => {
      const usd = new Money(100, 'USD');
      const bs = new Money(100, 'BS');
      expect(() => usd.subtract(bs)).toThrow(CurrencyMismatchError);
    });

    it('returns a new Money instance (immutability)', () => {
      const a = new Money(100, 'USD');
      const b = new Money(40, 'USD');
      const result = a.subtract(b);
      expect(result).not.toBe(a);
      expect(a.amount).toBe(100); // original unchanged
    });
  });
});
