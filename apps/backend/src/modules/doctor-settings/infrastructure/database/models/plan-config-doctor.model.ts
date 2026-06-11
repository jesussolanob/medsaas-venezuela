import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Read-only Sequelize model for the `plan_configs` table, scoped to the
 * doctor-settings module.
 *
 * Only the columns needed by GetDoctorFeaturesV2UseCase are declared here —
 * this keeps the model minimal and decoupled from the admin module's model.
 */
@Table({
  tableName: 'plan_configs',
  timestamps: false,
  underscored: true,
})
export class PlanConfigDoctorModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'plan_key' })
  declare planKey: string;

  @Default('doctor')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'role_key' })
  declare roleKey: string;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'is_permanent' })
  declare isPermanent: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'sort_order' })
  declare sortOrder: number;
}
