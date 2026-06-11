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

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
