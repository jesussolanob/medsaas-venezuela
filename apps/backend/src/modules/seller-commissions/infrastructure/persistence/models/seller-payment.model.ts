import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `seller_payments` table.
 *
 * A payment corresponds to a batch settlement of pending commissions for a seller.
 */
@Table({
  tableName: 'seller_payments',
  timestamps: false,
  underscored: true,
})
export class SellerPaymentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'seller_id' })
  declare sellerId: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: string; // Sequelize returns NUMERIC as string

  @Column({ type: DataType.TEXT, allowNull: false })
  declare method: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare reference: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'receipt_url' })
  declare receiptUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'paid_at' })
  declare paidAt: Date;

  /** Profile id of the admin who registered this payment. */
  @Column({ type: DataType.UUID, allowNull: false, field: 'created_by' })
  declare createdBy: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
