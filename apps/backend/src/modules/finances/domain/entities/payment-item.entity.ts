/**
 * Domain entity representing a line item attached to a Payment.
 *
 * Payment items are used to break down a payment into named components
 * (e.g. consultation fee, additional service, medication).
 *
 * The total of a payment is: base amount + sum(payment_items.amount_usd).
 */
export class PaymentItem {
  private constructor(
    public readonly id: string,
    public readonly paymentId: string,
    public readonly doctorId: string,
    public readonly name: string,
    public readonly amountUsd: number,
    public readonly sourceType: string | null,
    public readonly sourceId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(params: {
    id: string;
    paymentId: string;
    doctorId: string;
    name: string;
    amountUsd: number;
    sourceType?: string | null;
    sourceId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentItem {
    return new PaymentItem(
      params.id,
      params.paymentId,
      params.doctorId,
      params.name,
      params.amountUsd,
      params.sourceType ?? null,
      params.sourceId ?? null,
      params.createdAt,
      params.updatedAt,
    );
  }

  /** Anti-IDOR: confirm this item belongs to the given doctor. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }
}
