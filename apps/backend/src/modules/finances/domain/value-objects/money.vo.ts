import { CurrencyMismatchError } from '../errors/currency-mismatch.error';
import { InvalidAmountError } from '../errors/invalid-amount.error';

export type Currency = 'USD' | 'BS';

/**
 * Value object representing a monetary amount in a specific currency.
 *
 * Invariants:
 *   - amount >= 0 (negative amounts are rejected; the Money VO represents a
 *     magnitude, not a signed position)
 *   - currency must be 'USD' or 'BS'
 *   - add() and subtract() require both operands to share the same currency
 *
 * Zero is permitted at the VO level to support aggregate results (e.g. a sum
 * that happens to total $0). Individual transaction amounts are validated at
 * the use-case / DTO layer (Zod z.number().positive()) to reject zero before
 * a Money is constructed for a transaction entry.
 *
 * TODO TD-FINANCES-002: If Money is ever used outside aggregate/summary
 * contexts for strict ledger entries, consider a factory method
 * `Money.forTransaction(amount, currency)` that enforces amount > 0,
 * keeping the constructor permissive for internal aggregate use.
 */
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {
    if (amount < 0) {
      throw new InvalidAmountError(amount);
    }
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
   * Throws CurrencyMismatchError if currencies differ.
   * Throws InvalidAmountError if the result is negative (Money cannot represent
   * a negative magnitude — callers that need signed deficit values should compute
   * the difference as a plain number outside the VO).
   *
   * The financial summary (GetFinancialSummaryUseCase) computes net as a raw
   * signed number for exactly this reason: a deficit month produces a negative
   * net that is not representable as Money.
   */
  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError();
    }
    const result = this.amount - other.amount;
    if (result < 0) {
      throw new InvalidAmountError(result);
    }
    return new Money(result, this.currency);
  }
}
