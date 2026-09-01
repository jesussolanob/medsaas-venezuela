import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { QuoteModel } from './quote.model';

/**
 * Sequelize model for the `quote_share_links` table.
 *
 * Token: 48 bytes base64url (~64 chars). UNIQUE in the DB.
 * A revoked link has revoked_at set; it must not grant access even if
 * expires_at is in the future.
 */
@Table({
  tableName: 'quote_share_links',
  timestamps: false,
  underscored: true,
})
export class QuoteShareLinkModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => QuoteModel)
  @Column({ type: DataType.UUID, allowNull: false, field: 'quote_id' })
  declare quoteId: string;

  @BelongsTo(() => QuoteModel, { foreignKey: 'quote_id', as: 'quote' })
  declare quote?: QuoteModel;

  @Column({ type: DataType.TEXT, allowNull: false, unique: true })
  declare token: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'expires_at' })
  declare expiresAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'revoked_at' })
  declare revokedAt: Date | null;
}
