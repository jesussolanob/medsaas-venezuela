import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `payment_items` table.
 *
 * Each row represents one line item attached to a payment.
 * When a payment_item is inserted or deleted, the repository recalculates
 * payments.amount_usd = base + sum(items) inside a transaction.
 */
@Table({
  tableName: 'payment_items',
  timestamps: true,
  underscored: true,
})
export class PaymentItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'payment_id' })
  declare paymentId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: number;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'source_type' })
  declare sourceType: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'source_id' })
  declare sourceId: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
