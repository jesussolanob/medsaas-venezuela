import { Column, DataType, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';

/**
 * Sequelize model for the `app_settings` table.
 *
 * Key/value store for application-wide settings (e.g. usdt_rate).
 * Maps to migration 20260602000004-finances.cjs.
 */
@Table({
  tableName: 'app_settings',
  timestamps: true,
  createdAt: false,
  underscored: true,
})
export class AppSettingModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.TEXT, primaryKey: true })
  declare key: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare value: string;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
