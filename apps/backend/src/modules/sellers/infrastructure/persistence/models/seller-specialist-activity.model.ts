import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `seller_specialist_activities` table.
 *
 * Append-only log of follow-up actions a seller records against one of their
 * attributed specialists. No update or delete paths exist.
 *
 * NOTE: no @BelongsTo / @HasMany associations — avoids circular
 * SequelizeModule.forFeature() conflicts between modules.
 */
@Table({
  tableName: 'seller_specialist_activities',
  timestamps: false,
  underscored: true,
})
export class SellerSpecialistActivityModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'specialist_id' })
  declare specialistId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'seller_id' })
  declare sellerId: string;

  /**
   * Activity type: 'status_change' or 'comment'.
   * TEXT + CHECK constraint in the DB (no Postgres ENUM — avoids ADD VALUE DDL).
   */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare type: string;

  /** Previous status before this change. null for comment-only entries. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'from_status' })
  declare fromStatus: string | null;

  /** New status after this change. null for comment-only entries. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'to_status' })
  declare toStatus: string | null;

  /** Free-text note. max 2000 chars. null for status-only entries. */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare comment: string | null;

  // The server stamps the date (owner rule). Without a model default Sequelize
  // rejected the insert as notNull before reaching the DB's DEFAULT now() —
  // invisible to the mocked-Sequelize tests, a 500 in staging.
  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
    field: 'created_at',
  })
  declare createdAt: Date;
}
