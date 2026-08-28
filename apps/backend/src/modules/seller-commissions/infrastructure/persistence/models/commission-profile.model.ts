import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `profiles` table scoped to the seller-commissions module.
 *
 * Declares only the columns needed by commission use cases:
 *   - sold_by, sold_by_source for commission eligibility checks
 *   - is_active for seller activity checks
 *   - role for discriminating doctor vs seller profiles
 *   - full_name for enriching commission list views (PII — never log)
 *
 * No @BelongsTo / @HasOne associations — avoids circular SequelizeModule.forFeature()
 * conflicts between modules (same pattern as seller-profile.model.ts).
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class CommissionProfileModel extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  /** PII — full name. Never log. Only used for enriching commission list views. */
  @Column({ type: DataType.TEXT, allowNull: false, field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare role: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean | null;

  /**
   * FK to the seller who attributed this specialist.
   * NULL = not attributed. Written at most once for code path; overwritable by admin.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'sold_by' })
  declare soldBy: string | null;

  /**
   * 'code' = attributed via seller code during onboarding.
   * 'admin' = attributed by a super_admin explicitly.
   * NULL = not attributed to any seller.
   * TEXT — not ENUM (see migration rationale).
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'sold_by_source' })
  declare soldBySource: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
