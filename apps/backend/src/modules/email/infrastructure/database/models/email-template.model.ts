import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `email_templates` table.
 *
 * NOTE: This model is registered via SequelizeModule.forFeature in EmailModule.
 * NEVER add it to global providers or AppModule's models array.
 */
@Table({
  tableName: 'email_templates',
  timestamps: true,
  underscored: true,
})
export class EmailTemplateModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, unique: true })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare subject: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare html: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare text: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'is_active' })
  declare isActive: boolean;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
