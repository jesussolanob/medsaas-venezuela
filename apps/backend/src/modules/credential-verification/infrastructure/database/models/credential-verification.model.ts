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
 * Sequelize model for the `credential_verifications` table.
 *
 * Tracks the verification attempt result for each (doctor, credential_type) pair.
 * Note: No @BelongsTo decorators to avoid circular forFeature() conflicts.
 */
@Table({
  tableName: 'credential_verifications',
  timestamps: true,
  underscored: true,
})
export class CredentialVerificationModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'credential_type' })
  declare credentialType: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'declared_value' })
  declare declaredValue: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'verifier_id' })
  declare verifierId: string | null;

  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare evidence: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'checked_at' })
  declare checkedAt: Date | null;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare attempts: number;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'last_error' })
  declare lastError: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
