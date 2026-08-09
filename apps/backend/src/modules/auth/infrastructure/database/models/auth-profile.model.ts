import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `profiles` table — scoped to the auth module.
 *
 * Only the columns required for identity resolution are declared here.
 * The full DoctorProfileModel (doctor-settings) owns the complete column set.
 *
 * Includes the `auth0_sub` column added by migration 20260608000000.
 *
 * NOTE: No @BelongsTo / @HasMany associations to avoid circular
 * SequelizeModule.forFeature() registration conflicts.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class AuthProfileModel extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare email: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare role: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean | null;

  /**
   * Who switched the account off — 'self' | 'admin'. Added by migration
   * 20260809000001. Meaningful only while isActive is false; the guard reads it
   * to tell a voluntary deactivation apart from an admin ban.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'deactivated_by' })
  declare deactivatedBy: string | null;

  /** Auth0 subject identifier — added by migration 20260608000000. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'auth0_sub' })
  declare auth0Sub: string | null;

  /**
   * Subscription snapshot columns — written by the auth/register flow and kept in
   * sync by admin / billing flows. Declared here so the identity repository can set
   * them on initial doctor creation without needing the full ProfileAdminModel.
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'subscription_status' })
  declare subscriptionStatus: string | null;

  /** Timestamp of the most recent login touch — added by migration 20260612000002. */
  @Column({ type: DataType.DATE, allowNull: true, field: 'last_sign_in_at' })
  declare lastSignInAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
