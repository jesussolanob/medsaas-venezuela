import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `specialty_default_blocks` table.
 *
 * Composite PK: (specialty, block_key).
 * Read-mostly — seeded via migration; no updated_at in the original schema.
 */
@Table({
  tableName: 'specialty_default_blocks',
  timestamps: false,
  underscored: true,
})
export class SpecialtyDefaultBlockModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.TEXT, allowNull: false })
  declare specialty: string;

  @PrimaryKey
  @Column({ type: DataType.TEXT, allowNull: false, field: 'block_key' })
  declare blockKey: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare enabled: boolean;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'sort_order' })
  declare sortOrder: number;
}
