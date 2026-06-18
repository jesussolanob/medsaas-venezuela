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
 * Read-only Sequelize model for the `profiles` table (T-01 in spec 03b-schema-real.md).
 *
 * This model is used by the BookingModule to look up doctor public info.
 * It is read-only here — writes to profiles happen in the (future) profiles module.
 *
 * Only the columns needed for booking are declared.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class ProfileModel extends Model {
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

  @Column({ type: DataType.TEXT, allowNull: true, field: 'professional_title' })
  declare professionalTitle: string | null;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true, field: 'payment_methods' })
  declare paymentMethods: string[] | null;

  // payment_details is intentionally not selected — the column exists in the DB
  // but the public booking surface does not need the full payment detail blob.

  @Column({ type: DataType.TEXT, allowNull: true, field: 'avatar_url' })
  declare avatarUrl: string | null;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'allows_online' })
  declare allowsOnline: boolean | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'office_address' })
  declare officeAddress: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare city: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare state: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean | null;

  /**
   * The doctor's current plan key (e.g. 'delta_free', 'delta_base', 'delta_plus').
   * Used by the booking feature checker to resolve the effective plan.
   * Null means the doctor has never had a plan set → treat as 'delta_free'.
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  /**
   * The doctor's current subscription status (e.g. 'active', 'trial', 'past_due').
   * Used together with `plan` for lazy-downgrade resolution.
   * Null → treat as expired → downgrade to permanent free plan.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'subscription_status' })
  declare subscriptionStatus: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
