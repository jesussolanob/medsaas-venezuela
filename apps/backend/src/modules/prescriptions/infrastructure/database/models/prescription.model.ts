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
 * Sequelize model for the `prescriptions` table (T-09 in spec 03b-schema-real.md).
 *
 * PHI columns (medication, dosage) are stored as AES-256-GCM ciphertext (base64).
 * Non-PHI columns (frequency, duration, notes) are stored in plaintext.
 * Encryption/decryption happens in SequelizePrescriptionRepository, not here.
 *
 * IMPORTANT: the real DB column is `medication` (NOT `medication_name`).
 * The plan doc 05-ehr-prescriptions.md was outdated.
 *
 * NOTE: patient_id is NULLABLE per real schema T-09. There is no issued_date —
 * use created_at as the effective date.
 */
@Table({
  tableName: 'prescriptions',
  timestamps: true,
  underscored: true,
})
export class PrescriptionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  // patient_id is nullable per T-09 real schema
  @Column({ type: DataType.UUID, allowNull: true, field: 'patient_id' })
  declare patientId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'consultation_id' })
  declare consultationId: string | null;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: false })
  declare medication: string;

  // PHI — stored as AES-256-GCM ciphertext. Never log this value.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare dosage: string | null;

  // plaintext — frequency is not PHI
  @Column({ type: DataType.TEXT, allowNull: true })
  declare frequency: string | null;

  // plaintext — duration is not PHI
  @Column({ type: DataType.TEXT, allowNull: true })
  declare duration: string | null;

  // plaintext — notes column name is `notes` (NOT `instructions`)
  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
