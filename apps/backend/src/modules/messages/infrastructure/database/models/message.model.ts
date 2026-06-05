import { Column, CreatedAt, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `patient_messages` table.
 *
 * PHI column: `body` stores AES-256-GCM ciphertext (iv||ct||tag, base64-encoded).
 * Encryption and decryption happen in SequelizeMessageRepository, NOT here.
 *
 * timestamps: false → we manage created_at manually; there is no updated_at column.
 * The `direction` column is stored as TEXT with a DB-level CHECK constraint.
 */
@Table({
  tableName: 'patient_messages',
  timestamps: false,
  underscored: true,
})
export class MessageModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  /** Stores AES-256-GCM ciphertext — decrypt in repository before returning. */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare body: string;

  /** 'patient_to_doctor' | 'doctor_to_patient' — enforced by DB CHECK constraint. */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare direction: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'read_at' })
  declare readAt: Date | null;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
