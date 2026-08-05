import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { SubscriptionPaymentStatus } from '../../../domain/entities/subscription-payment.entity';

/**
 * Sequelize model for the `subscription_payments` table.
 *
 * Tracks platform subscription payments submitted by doctors for admin review.
 * Sensitive financial fields (amount, reference) are NOT encrypted — these are
 * platform-level records, not patient PII.
 *
 * New columns added by migration 20260805000002-subscription-payments-doctor-checkout:
 *   amount_bs, bcv_rate_used, bank_code, receipt_url, notes, plan_key, period, rejection_reason
 */
@Table({
  tableName: 'subscription_payments',
  timestamps: true,
  underscored: true,
})
export class SubscriptionPaymentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare method: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'reference_number' })
  declare referenceNumber: string | null;

  @Default(1)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'duration_months' })
  declare durationMonths: number;

  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: SubscriptionPaymentStatus;

  @Column({ type: DataType.UUID, allowNull: true, field: 'reviewed_by' })
  declare reviewedBy: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'reviewed_at' })
  declare reviewedAt: Date | null;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;

  // ---------------------------------------------------------------------------
  // Checkout columns (added by migration 20260805000002)
  // ---------------------------------------------------------------------------

  /** Bolívar amount — server-calculated, never trusted from client. */
  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true, field: 'amount_bs' })
  declare amountBs: number | null;

  /** BCV rate (BS/USD) used at submission time (4 decimal places). */
  @Column({ type: DataType.DECIMAL(14, 4), allowNull: true, field: 'bcv_rate_used' })
  declare bcvRateUsed: number | null;

  /** Venezuelan bank institution code (4 digits from VENEZUELAN_BANKS catalog). */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'bank_code' })
  declare bankCode: string | null;

  /**
   * GCS object path (NOT a signed URL).
   * Sign on demand via STORAGE_PORT.getSignedUrl().
   * Never expose the raw path to clients — always return a signed URL.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'receipt_url' })
  declare receiptUrl: string | null;

  /** Optional doctor notes accompanying the payment comprobante. */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  /** Platform subscription plan the doctor is paying for. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'plan_key' })
  declare planKey: string | null;

  /** Billing period: monthly | quarterly | semiannual | annual. */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare period: string | null;

  /** Reason written by super_admin when rejecting the payment. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'rejection_reason' })
  declare rejectionReason: string | null;
}
