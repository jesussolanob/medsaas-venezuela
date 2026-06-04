import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `subscription_changes_log` table.
 *
 * Immutable audit log — rows are only inserted, never updated or deleted.
 * Tracks all subscription lifecycle events (payment approval, manual changes, etc.).
 */
@Table({
  tableName: 'subscription_changes_log',
  timestamps: false,
  underscored: true,
})
export class SubscriptionChangeLogModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare action: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'actor_id' })
  declare actorId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'actor_role' })
  declare actorRole: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare reason: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'subscription_expires_at' })
  declare subscriptionExpiresAt: Date | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare metadata: Record<string, unknown> | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
