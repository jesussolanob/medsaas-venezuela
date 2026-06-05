import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `doctor_quick_items` table.
 *
 * IMPORTANT:
 *   - Sequelize is provided globally via SequelizeModule.forRootAsync in AppModule.
 *     Only register this model via SequelizeModule.forFeature([QuickItemModel]).
 *   - Never add Sequelize to module providers directly — it causes dist boot crash.
 */
@Table({
  tableName: 'doctor_quick_items',
  timestamps: false, // only created_at, no updated_at
  underscored: true,
})
export class QuickItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'item_type' })
  declare itemType: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare category: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare details: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
