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
 * Sequelize model for the `release_notes` table.
 *
 * No PII encryption: release notes contain no personal health data.
 *
 * IMPORTANT: NEVER register Sequelize in providers — it is provided globally
 * via SequelizeModule.forRootAsync in AppModule.
 */
@Table({
  tableName: 'release_notes',
  timestamps: true,
  underscored: true,
})
export class ReleaseNoteModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare body: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'image_url' })
  declare imageUrl: string | null;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true, field: 'audience_plans' })
  declare audiencePlans: string[] | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'published_at' })
  declare publishedAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'created_by' })
  declare createdBy: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
