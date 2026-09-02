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
 *
 * Status transitions: pending → approved → paid.
 *   pending  — accrued automatically; not yet reviewed.
 *   approved — an admin reviewed it and enabled it for payment.
 *   paid     — included in a seller_payment. Terminal.
 *
 * ApproveCommissionsUseCase drives pending → approved; RegisterSellerPaymentUseCase
 * drives approved → paid via the repository, which updates status and sets
 * payment_id atomically.
 *
 * ⚠️ Paying skips no step: a pending commission can NOT go straight to paid. The
 * guard lives in the repository query (inside the transaction), not only in the
 * use case — two concurrent clicks would otherwise slip past it.
 *
 * NOTE: No NestJS / Sequelize imports here — pure domain.
 */
export type CommissionType = 'signup' | 'plan';
export type CommissionStatus = 'pending' | 'approved' | 'paid';

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
    /** Set when an admin approves. Null for rows paid before approval existed. */
    public readonly approvedAt: Date | null = null,
    /** Admin profile id that approved. Null for the same historical reason. */
    public readonly approvedBy: string | null = null,
  ) {}

  isPending(): boolean {
    return this.status === 'pending';
  }

  isApproved(): boolean {
    return this.status === 'approved';
  }

  isPaid(): boolean {
    return this.status === 'paid';
  }

  /** Only an approved commission can be included in a payment. */
  isPayable(): boolean {
    return this.status === 'approved';
  }
}
