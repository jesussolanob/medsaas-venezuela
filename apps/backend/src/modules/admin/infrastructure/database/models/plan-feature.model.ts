import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `plan_features` table (T-03 in spec 03b-schema-real.md).
 *
 * Each row enables or disables a specific feature (featureKey) for a given plan.
 * The unique constraint (plan, feature_key) is enforced at the DB level.
 *
 * `plan` is a logical FK to plan_configs.plan_key (text, not a formal FK constraint
 * per the v24 schema spec — the DB does not have a formal FK here).
 */
@Table({
  tableName: 'plan_features',
  timestamps: true,
  underscored: true,
})
export class PlanFeatureModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare plan: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'feature_key' })
  declare featureKey: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'feature_label' })
  declare featureLabel: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare enabled: boolean;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
