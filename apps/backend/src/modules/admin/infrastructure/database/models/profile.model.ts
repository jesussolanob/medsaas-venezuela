import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Lightweight Sequelize model for the `profiles` table — admin read-only view.
 *
 * Only the columns needed by admin use cases are declared here. The full
 * profile model lives in the (forthcoming) profiles module.
 *
 * NOTE: no @BelongsTo / @HasOne associations are declared to avoid circular
 * module dependencies with the SequelizeModule.forFeature() registry.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class ProfileAdminModel extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare email: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare role: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare specialty: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean | null;

  /**
   * Deactivation provenance for the is_active switch. Added by migration
   * 20260809000001. 'self' = the specialist deactivated their own account,
   * 'admin' = banned from this panel. All NULL while the account is live.
   */
  @Column({ type: DataType.DATE, allowNull: true, field: 'deactivated_at' })
  declare deactivatedAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'deactivated_by' })
  declare deactivatedBy: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'deactivation_reason' })
  declare deactivationReason: string | null;

  // Snapshot columns written by the auth/register flow
  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'subscription_status' })
  declare subscriptionStatus: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'subscription_expires_at' })
  declare subscriptionExpiresAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare phone: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare cedula: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare city: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare state: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_sign_in_at' })
  declare lastSignInAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
