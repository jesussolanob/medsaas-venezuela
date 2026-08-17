import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `profiles` table scoped to sellers module.
 *
 * Declares only the columns needed by seller use cases. The full profile model
 * lives in each module that needs it (no shared global profile model to avoid
 * circular dependencies).
 *
 * NOTE: no @BelongsTo / @HasOne associations — avoids circular
 * SequelizeModule.forFeature() conflicts between modules.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class SellerProfileModel extends Model {
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

  /** The plan snapshot column — only populated for doctor/specialist profiles. */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'subscription_status' })
  declare subscriptionStatus: string | null;

  /**
   * Short alphanumeric code that the seller shares with prospects.
   * Only set on profiles with role = 'seller'. NULL for all other roles.
   * Added by migration 20260816000001-seller-role.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'seller_code' })
  declare sellerCode: string | null;

  /**
   * FK to the seller who onboarded this specialist.
   * NULL = not attributed to any seller.
   * Written exactly once — never overwritten after the first attribution.
   * Added by migration 20260816000001-seller-role.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'sold_by' })
  declare soldBy: string | null;

  /**
   * Timestamp of the seller's or specialist's last authenticated session.
   * Updated by the identity-resolver on every login. NULL = never logged in.
   */
  @Column({ type: DataType.DATE, allowNull: true, field: 'last_sign_in_at' })
  declare lastSignInAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
