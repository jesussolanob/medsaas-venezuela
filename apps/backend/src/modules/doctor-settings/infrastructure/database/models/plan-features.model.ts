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
 * Sequelize model for the `plan_features` table (T-03 in spec 03b-schema-real.md).
 *
 * Maps feature keys to plans with enabled/disabled status.
 */
@Table({
  tableName: 'plan_features',
  timestamps: true,
  underscored: true,
})
export class PlanFeaturesModel extends Model {
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

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
