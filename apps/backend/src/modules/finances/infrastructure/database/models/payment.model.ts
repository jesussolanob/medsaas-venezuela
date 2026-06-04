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
 * Sequelize model for the `payments` table.
 *
 * This table is the FINANCIAL SOURCE OF TRUTH for doctor income.
 * All income aggregations must query this table with status='approved'.
 * Derived columns (consultations.payment_status, appointments.plan_price) are
 * kept in sync by the application layer — never used as primary source.
 *
 * No associations declared here to keep the model thin and avoid circular
 * imports; joins are performed via raw includes/queries in the repository.
 */
@Table({
  tableName: 'payments',
  timestamps: true,
  underscored: true,
})
export class PaymentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: number;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true, field: 'amount_bs' })
  declare amountBs: number | null;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true, field: 'bcv_rate' })
  declare bcvRate: number | null;

  @Default('USD')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare currency: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'method_snapshot' })
  declare methodSnapshot: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_reference' })
  declare paymentReference: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_receipt_url' })
  declare paymentReceiptUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_code' })
  declare paymentCode: string | null;

  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'paid_at' })
  declare paidAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'package_id' })
  declare packageId: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
