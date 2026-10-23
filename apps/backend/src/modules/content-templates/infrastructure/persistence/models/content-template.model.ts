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
 * Sequelize model for the `content_templates` table.
 *
 * IMPORTANT:
 *   - Sequelize is NOT in module providers — it is global via AppModule.
 *   - Register only via SequelizeModule.forFeature([ContentTemplateModel]).
 *
 * DB constraints (enforced in migration 20261022000001):
 *   - type CHECK IN (recipe, paraclinical, reposo, presupuesto)
 *   - INDEX (doctor_id, type)
 */
@Table({
  tableName: 'content_templates',
  timestamps: true,
  underscored: true,
})
export class ContentTemplateModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare type: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare content: Record<string, unknown>;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
