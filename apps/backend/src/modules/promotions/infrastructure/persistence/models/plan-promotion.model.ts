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
 * Sequelize model for the `plan_promotions` table.
 *
 * Schema notes:
 *   - original_price_usd and promo_price_usd are stored as DECIMAL in Postgres.
 *     Always convert via Number() when reading — Sequelize returns strings for DECIMAL.
 *   - ends_at is nullable; NULL means no expiry date.
 *   - is_active defaults to true on creation.
 *
 * No encryption — promotion data is not PHI. No PII fields.
 */
@Table({
  tableName: 'plan_promotions',
  timestamps: true,
  underscored: true,
})
export class PlanPromotionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'plan_key' })
  declare planKey: string;

  @Default(3)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'duration_months' })
  declare durationMonths: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, field: 'original_price_usd' })
  declare originalPriceUsd: string | number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, field: 'promo_price_usd' })
  declare promoPriceUsd: string | number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare label: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'is_active' })
  declare isActive: boolean;

  @Column({ type: DataType.DATE, allowNull: true, field: 'ends_at' })
  declare endsAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
