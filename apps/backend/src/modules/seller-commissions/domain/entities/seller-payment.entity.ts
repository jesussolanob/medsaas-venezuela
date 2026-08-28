/**
 * SellerPayment — domain entity.
 *
 * Represents a payment registered by an admin to settle pending commissions
 * for a specific seller.
 *
 * A payment is linked to one or more SellerCommission rows via payment_id FK.
 * The amount is calculated by summing the commissions included — it is NEVER
 * trusted from the client.
 *
 * NOTE: No NestJS / Sequelize imports here — pure domain.
 */
export class SellerPayment {
  constructor(
    public readonly id: string,
    public readonly sellerId: string,
    /** Sum of the commissions included in this payment batch. */
    public readonly amountUsd: number,
    /** Payment method description (e.g. "Zelle", "Transferencia"). */
    public readonly method: string,
    /** Transaction reference number provided by the admin. */
    public readonly reference: string,
    /** Optional URL to a receipt / proof image uploaded by the admin. */
    public readonly receiptUrl: string | null,
    public readonly notes: string | null,
    public readonly paidAt: Date,
    /** Profile id of the admin who registered this payment. */
    public readonly createdBy: string,
    public readonly createdAt: Date,
  ) {}
}
