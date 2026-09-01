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
 * Sequelize model for the `consultation_extra_items` table.
 *
 * Each row represents one additional service billed during a consultation payment
 * (e.g. "Limpieza dental — $20").
 *
 * Items are replaced atomically (delete + insert in one transaction) every time
 * the doctor approves/re-approves the payment. There is no individual item update.
 *
 * No `updated_at` column — the table uses append-only semantics with full
 * replacement managed at the application level.
 */
@Table({
  tableName: 'consultation_extra_items',
  timestamps: false, // manual created_at only; no updated_at
})
export class ConsultationExtraItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'consultation_id' })
  declare consultationId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'amount_usd' })
  declare amountUsd: number;

  /**
   * Populated when this extra item represents an inventory product sale.
   * NULL for free-text service extras (e.g. "Limpieza dental").
   * Set to ON DELETE SET NULL in the DB — the line persists even if the
   * product is later deleted.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'product_id' })
  declare productId: string | null;

  /**
   * Quantity sold. Always >= 1. Defaults to 1 for service extras.
   */
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 1, field: 'quantity' })
  declare quantity: number;

  /**
   * Unit price in USD at the moment of sale. NULL for service extras (they
   * carry the total in amount_usd directly).
   */
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'unit_price_usd' })
  declare unitPriceUsd: number | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
