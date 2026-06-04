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
 * Sequelize model for the `consultation_block_catalog` table.
 *
 * Read-mostly table — seeded via migration.
 * No timestamps beyond created_at (no updated_at in the original schema).
 */
@Table({
  tableName: 'consultation_block_catalog',
  timestamps: false,
  underscored: true,
})
export class ConsultationBlockCatalogModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.TEXT, allowNull: false })
  declare key: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'default_label' })
  declare defaultLabel: string;

  @Default('rich_text')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'default_content_type' })
  declare defaultContentType: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'default_printable' })
  declare defaultPrintable: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'default_send_to_patient' })
  declare defaultSendToPatient: boolean;

  /**
   * Whether the block is enabled by default for doctors with no specialty override.
   * Only the 4 core blocks (chief_complaint, diagnosis, treatment, prescription)
   * default to true; everything else defaults to false.
   */
  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'default_enabled' })
  declare defaultEnabled: boolean;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
