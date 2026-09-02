import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `seller_commissions` table.
 *
 * UNIQUE(specialist_id, type) is enforced at the DB level (migration), so the
 * repository's ON CONFLICT DO NOTHING keeps this idempotent.
 */
@Table({
  tableName: 'seller_commissions',
  timestamps: false,
  underscored: true,
})
export class SellerCommissionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'seller_id' })
  declare sellerId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'specialist_id' })
  declare specialistId: string;

  /** 'signup' | 'plan' */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare type: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: string; // Sequelize returns NUMERIC as string

  /** Only set for 'plan' commissions. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'plan_key' })
  declare planKey: string | null;

  /** 'pending' | 'approved' | 'paid' */
  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'earned_at' })
  declare earnedAt: Date;

  /** Set when status = 'paid'. References seller_payments(id). */
  @Column({ type: DataType.UUID, allowNull: true, field: 'payment_id' })
  declare paymentId: string | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;

  /** Cuándo un admin la habilitó para pago. Null en las pagadas antes del estado. */
  @Column({ type: DataType.DATE, allowNull: true, field: 'approved_at' })
  declare approvedAt: Date | null;

  /** Qué admin la habilitó. Null por el mismo motivo histórico. */
  @Column({ type: DataType.UUID, allowNull: true, field: 'approved_by' })
  declare approvedBy: string | null;
}
