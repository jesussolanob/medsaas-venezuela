import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { SubscriptionPaymentStatus } from '../../../domain/entities/subscription-payment.entity';

/**
 * Sequelize model for the `subscription_payments` table.
 *
 * Tracks platform subscription payments submitted by doctors for admin review.
 * Sensitive financial fields (amount, reference) are NOT encrypted — these are
 * platform-level records, not patient PII.
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
}
