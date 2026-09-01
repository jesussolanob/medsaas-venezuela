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
 * Sequelize model for the `inventory_movements` table.
 *
 * Append-only ledger: no updated_at, no soft delete.
 * The consultation repo's approveWithExtras deletes and reinserts sale rows
 * to maintain idempotency — see §3 of the spec.
 */
@Table({
  tableName: 'inventory_movements',
  timestamps: false,
  underscored: true,
})
export class InventoryMovementModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'product_id' })
  declare productId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare kind: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare qty: string; // DECIMAL as string from pg

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'unit_price_usd' })
  declare unitPriceUsd: string | null;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true, field: 'rate_used' })
  declare rateUsed: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'rate_source' })
  declare rateSource: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'consultation_id' })
  declare consultationId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
