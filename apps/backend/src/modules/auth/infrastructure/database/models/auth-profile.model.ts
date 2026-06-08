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

  /** Auth0 subject identifier — added by migration 20260608000000. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'auth0_sub' })
  declare auth0Sub: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
