import { Column, CreatedAt, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `bcv_rate_history` table.
 *
 * One row per calendar day — rate_date is the PRIMARY KEY.
 * Used as a local cache for historical BCV USD/VES rates so
 * the settings/bcv-rate?date= endpoint avoids repeated external requests.
 */
@Table({
  tableName: 'bcv_rate_history',
  timestamps: false,
  underscored: true,
})
export class BcvRateHistoryModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.DATEONLY, allowNull: false, field: 'rate_date' })
  declare rateDate: string;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: false })
  declare rate: number;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare source: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
