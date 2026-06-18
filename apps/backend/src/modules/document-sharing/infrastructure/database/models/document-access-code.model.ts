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
 * Sequelize model for the `document_access_codes` table.
 *
 * Stores the 6-digit verification codes linked to shared_document_links.
 * Codes expire after 48h and are locked after 5 failed attempts.
 *
 * No UpdatedAt — mark_used and increment_failed are raw SQL updates
 * for atomicity.
 */
@Table({
  tableName: 'document_access_codes',
  timestamps: false,
})
export class DocumentAccessCodeModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'link_id' })
  declare linkId: string;

  /** 6-digit numeric code stored as plain text (not PHI; no encryption needed). */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare code: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'expires_at' })
  declare expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'used_at' })
  declare usedAt: Date | null;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'failed_attempts' })
  declare failedAttempts: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
