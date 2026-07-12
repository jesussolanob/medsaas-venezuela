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
 * Sequelize model for the `consultations` table (T-07 in spec 03b-schema-real.md).
 *
 * PHI columns (chief_complaint, diagnosis, treatment, notes) are stored as
 * AES-256-GCM ciphertext (base64). Encryption/decryption happens in
 * SequelizeConsultationRepository, not here. This model is a pure ORM mapping.
 *
 * payment_date is not in the initial schema — it is added by migration
 * 20260602000003-consultations-payment-date-and-code-unique.cjs.
 */
@Table({
  tableName: 'consultations',
  timestamps: true,
  underscored: true,
})
export class ConsultationModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'appointment_id' })
  declare appointmentId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, unique: true, field: 'consultation_code' })
  declare consultationCode: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'consultation_date' })
  declare consultationDate: Date;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: true, field: 'chief_complaint' })
  declare chiefComplaint: string | null;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare diagnosis: string | null;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare treatment: string | null;

  // Internal doctor notes — stored as AES-256-GCM ciphertext. Never log.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  // payment_status: text with CHECK('pending','approved'). Stored as text.
  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_status' })
  declare paymentStatus: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_method' })
  declare paymentMethod: string | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare amount: number | null;

  /**
   * Stable base price set once on first payment approval.
   * Added by migration 20260712000009.
   * total = base_amount + Σ(consultation_extra_items.amount_usd)
   */
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'base_amount' })
  declare baseAmount: number | null;

  // Added by migration 20260602000003
  @Column({ type: DataType.DATE, allowNull: true, field: 'payment_date' })
  declare paymentDate: Date | null;

  // Added by migration 20260710000003
  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_reference' })
  declare paymentReference: string | null;

  // Added by migration 20260710000003
  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_receipt_url' })
  declare paymentReceiptUrl: string | null;

  @Column({ type: DataType.JSONB, allowNull: true, field: 'blocks_snapshot' })
  declare blocksSnapshot: Record<string, unknown> | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
