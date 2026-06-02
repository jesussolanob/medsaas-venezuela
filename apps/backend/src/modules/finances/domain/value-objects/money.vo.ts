import { CurrencyMismatchError } from '../errors/currency-mismatch.error';
import { InvalidAmountError } from '../errors/invalid-amount.error';

export type Currency = 'USD' | 'BS';

/**
 * Value object representing a monetary amount in a specific currency.
 *
 * Invariants:
 *   - amount must be > 0 (use zero values separately in aggregate logic)
 *   - currency must be 'USD' or 'BS'
 *   - add() requires both operands to share the same currency
 */
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {
    if (amount < 0) {
      throw new InvalidAmountError(amount);
    }
    // Note: amount === 0 is permitted for aggregate calculations (e.g. net result).
    // Individual transaction amounts are validated at the use-case / DTO layer
    // (Zod z.number().positive()) to reject zero before reaching the domain.
  }

  /**
   * Converts this Money to USD using the given rate (BS per USD).
   * Returns `this` unchanged when already in USD.
   */
  toUSD(rate: number): Money {
    if (this.currency === 'USD') return this;
    return new Money(this.amount / rate, 'USD');
  }

  /**
   * Converts this Money to bolivares (BS) using the given rate (BS per USD).
   * Returns `this` unchanged when already in BS.
   */
  toBS(rate: number): Money {
    if (this.currency === 'BS') return this;
    return new Money(this.amount * rate, 'BS');
  }

  /**
   * Returns a new Money that is the sum of this and `other`.
   * Throws CurrencyMismatchError if currencies differ.
   */
  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError();
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Returns a new Money that is the difference (this - other).
   * Floors at zero: a net financial position cannot go below zero in the summary
   * view (expenses exceeding income means net = 0, not a negative balance).
   * Throws CurrencyMismatchError if currencies differ.
   *
   * TECH DEBT (Etapa 1): The silent floor is intentional for summary calculations
   * but could mask upstream bugs if subtract() is ever used to validate individual
   * transactions. If that use case arises, add a separate `subtractStrict()` that
   * throws on negative result. Tracked as TD-FINANCES-001.
   */
  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError();
    }
    const result = this.amount - other.amount;
    return new Money(Math.max(0, result), this.currency);
  }
}
