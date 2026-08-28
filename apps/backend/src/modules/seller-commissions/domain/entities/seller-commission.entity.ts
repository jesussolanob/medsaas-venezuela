/**
 * SellerCommission — domain entity.
 *
 * Represents a single commission event credited to a seller.
 * There are two types:
 *
 *   'signup' — credited when an attributed specialist completes onboarding.
 *              Only when sold_by_source = 'code'. Amount: $10 USD.
 *
 *   'plan'   — credited the first time an attributed specialist transitions to
 *              a paid plan (delta_base = $10, delta_plus = $20).
 *              Generated regardless of sold_by_source.
 *
 * Invariants enforced by the DB UNIQUE(specialist_id, type):
 *   - At most one 'signup' commission per specialist.
 *   - At most one 'plan' commission per specialist.
 *
 * No domain methods beyond construction — commissions are immutable once created.
 * The status transitions (pending → paid) are managed by RegisterSellerPaymentUseCase
 * via the repository, which updates status and sets payment_id atomically.
 *
 * NOTE: No NestJS / Sequelize imports here — pure domain.
 */
export type CommissionType = 'signup' | 'plan';
export type CommissionStatus = 'pending' | 'paid';

export class SellerCommission {
  constructor(
    public readonly id: string,
    public readonly sellerId: string,
    public readonly specialistId: string,
    public readonly type: CommissionType,
    /** Amount in USD. Stored as a plain number — monetary operations in the
     *  domain use plain arithmetic (no Money VO needed: amounts are fixed $10/$20). */
    public readonly amountUsd: number,
    /** Only set for 'plan' type. Null for 'signup'. */
    public readonly planKey: string | null,
    public readonly status: CommissionStatus,
    public readonly earnedAt: Date,
    /** Set when status = 'paid'. References a seller_payments row. */
    public readonly paymentId: string | null,
    public readonly createdAt: Date,
  ) {}

  isPending(): boolean {
    return this.status === 'pending';
  }

  isPaid(): boolean {
    return this.status === 'paid';
  }
}
