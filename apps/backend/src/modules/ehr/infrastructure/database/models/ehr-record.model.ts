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
 * Sequelize model for the `ehr_records` table (T-08 in spec 03b-schema-real.md).
 *
 * PHI columns (diagnosis, treatment_plan) are stored as AES-256-GCM ciphertext (base64).
 * Encryption/decryption happens in SequelizeEhrRepository, not here.
 * This model is a pure ORM mapping.
 */
@Table({
  tableName: 'ehr_records',
  timestamps: true,
  underscored: true,
})
export class EhrRecordModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'consultation_id' })
  declare consultationId: string | null;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare diagnosis: string | null;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: true, field: 'treatment_plan' })
  declare treatmentPlan: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
