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
 * Sequelize model for the `quote_items` table.
 *
 * 🔴 name, description, and unit_price_usd are SNAPSHOTS — never references.
 * source_id is informational only (no FK constraint in the DB).
 */
@Table({
  tableName: 'quote_items',
  timestamps: false,
  underscored: true,
})
export class QuoteItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => QuoteModel)
  @Column({ type: DataType.UUID, allowNull: false, field: 'quote_id' })
  declare quoteId: string;

  @BelongsTo(() => QuoteModel, { foreignKey: 'quote_id', as: 'quote' })
  declare quote?: QuoteModel;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare kind: string; // 'service' | 'product'

  /** No FK constraint — intentionally nullable and unconstrained (snapshot pattern). */
  @Column({ type: DataType.UUID, allowNull: true, field: 'source_id' })
  declare sourceId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare quantity: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'unit_price_usd' })
  declare unitPriceUsd: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: string;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'sort_order' })
  declare sortOrder: number;
}
