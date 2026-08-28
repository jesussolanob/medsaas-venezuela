import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { BillingPeriod } from '../../../domain/value-objects/plan-price.vo';

/**
 * Sequelize model for the `plan_prices` table.
 *
 * Each row stores the price for a given plan_key + billing period combination.
 * Created by migration 20260611000000-plan-configs-parametric.
 */
@Table({
  tableName: 'plan_prices',
  timestamps: true,
  underscored: true,
})
export class PlanPriceModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'plan_key' })
  declare planKey: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare period: BillingPeriod;

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'price_usd' })
  declare priceUsd: number;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'is_active' })
  declare isActive: boolean;

  /**
   * Reference price shown crossed-out beside the real price.
   * NULL = no promotional pricing for this period.
   * When set: must be > price_usd (enforced by the use case, not the DB).
   * Added by migration 20260828000001-seller-commissions.
   */
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true, field: 'compare_at_price' })
  declare compareAtPrice: number | null;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
