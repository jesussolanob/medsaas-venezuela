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
 * Sequelize model for the `products` table.
 *
 * IMPORTANT:
 *   - Never put Sequelize in module providers[] — it is global via
 *     SequelizeModule.forRootAsync in AppModule.
 *   - Register only via SequelizeModule.forFeature([ProductModel]).
 */
@Table({
  tableName: 'products',
  timestamps: true,
  underscored: true,
})
export class ProductModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: false, defaultValue: '' })
  declare description: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare supplier: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'photo_path' })
  declare photoPath: string | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'sale_price_amount' })
  declare salePriceAmount: string; // pg driver returns DECIMAL as string

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    defaultValue: 'USD',
    field: 'sale_price_currency',
  })
  declare salePriceCurrency: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'stock_qty' })
  declare stockQty: string; // DECIMAL comes as string from pg driver

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'low_stock_threshold' })
  declare lowStockThreshold: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' })
  declare isActive: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
