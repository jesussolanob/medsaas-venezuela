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
 * Sequelize model for the `role_capabilities` table.
 *
 * Schema:
 *   - id: uuid PK (uuid_generate_v4())
 *   - role: text NOT NULL
 *   - module_key: text NOT NULL
 *   - action: text NOT NULL — 'view' | 'create' | 'edit' | 'delete'
 *   - allowed: boolean NOT NULL DEFAULT true
 *   - UNIQUE (role, module_key, action)
 *
 * No encryption — this table contains role/permission metadata, not PHI.
 */
@Table({
  tableName: 'role_capabilities',
  timestamps: true,
  underscored: true,
})
export class RoleCapabilityModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare role: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'module_key' })
  declare moduleKey: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare action: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare allowed: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
