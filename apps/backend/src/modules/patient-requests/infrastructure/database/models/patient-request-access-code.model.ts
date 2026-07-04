import {
  AllowNull,
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `patient_request_access_codes` table.
 *
 * Stores 6-digit verification codes linked to patient_requests.
 * Codes expire after 48h and are locked after 5 failed attempts.
 */
@Table({
  tableName: 'patient_request_access_codes',
  timestamps: false,
})
export class PatientRequestAccessCodeModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'request_id' })
  declare requestId: string;

  /** 6-digit numeric code stored as plain text (not PHI; no encryption needed). */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare code: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'expires_at' })
  declare expiresAt: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: 'used_at' })
  declare usedAt: Date | null;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'failed_attempts' })
  declare failedAttempts: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
