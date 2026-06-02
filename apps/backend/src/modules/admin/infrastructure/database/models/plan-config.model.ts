import { Column, DataType, Default, Model, PrimaryKey, Table, Unique } from 'sequelize-typescript';

/**
 * Sequelize model for the `plan_configs` table (T-02 in spec 03b-schema-real.md).
 *
 * Stores the SaaS subscription plan configuration (prices, trial days, etc.).
 * Not to be confused with `pricing_plans` (T-11) which are per-doctor service prices.
 */
@Table({
  tableName: 'plan_configs',
  timestamps: true,
  underscored: true,
})
export class PlanConfigModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @Column({ type: DataType.TEXT, allowNull: false, field: 'plan_key' })
  declare planKey: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare price: number;

  @Default('USD')
  @Column({ type: DataType.TEXT, allowNull: true })
  declare currency: string | null;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'trial_days' })
  declare trialDays: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'sort_order' })
  declare sortOrder: number;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
