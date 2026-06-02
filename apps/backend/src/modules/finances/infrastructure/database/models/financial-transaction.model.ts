import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `financial_transactions` table.
 *
 * Maps to: migracion/03b-schema-real.md (finances section) +
 * migration 20260602000004-finances.cjs
 *
 * No business logic here — pure ORM mapping. All domain logic lives in
 * FinancialTransaction entity and use cases.
 */
@Table({
  tableName: 'financial_transactions',
  timestamps: true,
  updatedAt: false, // table has only created_at
  underscored: true,
})
export class FinancialTransactionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  declare type: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: number;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'USD' })
  declare currency: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'related_consultation_id' })
  declare relatedConsultationId: string | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'transaction_date' })
  declare transactionDate: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
