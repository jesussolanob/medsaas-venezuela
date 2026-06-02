import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `access_audit_log` table (T-17 in spec 03b-schema-real.md).
 *
 * This table is APPEND-ONLY. The model exposes no update or delete operations.
 * created_at is NOT NULL to guarantee audit trail integrity.
 */
@Table({
  tableName: 'access_audit_log',
  timestamps: false,
  underscored: true,
})
export class AccessAuditLogModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'actor_id' })
  declare actorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'actor_role' })
  declare actorRole: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  /** Which PII field was revealed: full_name | cedula | phone | email | … */
  @Column({ type: DataType.TEXT, allowNull: false, field: 'field_revealed' })
  declare fieldRevealed: string;

  /** Client IP address — stored as text for driver compatibility (inet in Postgres). */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'ip_address' })
  declare ipAddress: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'user_agent' })
  declare userAgent: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare reason: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
