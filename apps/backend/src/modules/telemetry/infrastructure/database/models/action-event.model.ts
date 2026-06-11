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
 * Sequelize model for the `action_events` table.
 *
 * SECURITY: NEVER log the `metadata` column contents — it is runtime-derived
 * and may contain unexpected data despite the PiiGuard checks.
 *
 * doctor_id is nullable: ON DELETE SET NULL preserves anonymised event history
 * when a doctor profile is deleted.
 */
@Table({
  tableName: 'action_events',
  timestamps: false,
  underscored: true,
})
export class ActionEventModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'doctor_id' })
  declare doctorId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'session_id' })
  declare sessionId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare action: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'resource_type' })
  declare resourceType: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'resource_id' })
  declare resourceId: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare metadata: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'occurred_at' })
  declare occurredAt: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
