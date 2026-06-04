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
 * Sequelize model for the `consultation_payments` table.
 *
 * No PHI encryption: amount, currency, payment_method, reference_number,
 * receipt_url, and notes are financial metadata — not patient personal
 * identifiers per CLAUDE.md encryption policy.
 *
 * The model is a pure ORM mapping; business logic lives in the domain entity.
 */
@Table({
  tableName: 'consultation_payments',
  timestamps: true,
  underscored: true,
})
export class ConsultationPaymentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'consultation_id' })
  declare consultationId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: number;

  @Default('USD')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare currency: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'payment_method' })
  declare paymentMethod: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'reference_number' })
  declare referenceNumber: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'receipt_url' })
  declare receiptUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  // status: 'pending' | 'approved' | 'rejected'
  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'approved_at' })
  declare approvedAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'approved_by' })
  declare approvedBy: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
