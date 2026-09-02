import {
  Column,
  CreatedAt,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { QuoteItemModel } from './quote-item.model';

/**
 * Sequelize model for the `quotes` table.
 *
 * IMPORTANT:
 *   - Sequelize is NOT in module providers — it is global via AppModule.
 *   - Register only via SequelizeModule.forFeature([QuoteModel]).
 *
 * DB constraints (enforced in migration 20260901000003):
 *   - UNIQUE (doctor_id, quote_number)
 *   - CHECK (patient_id IS NOT NULL) <> (lead_id IS NOT NULL)   [XOR]
 *   - status CHECK IN (draft, sent, accepted, rejected, expired)
 */
@Table({
  tableName: 'quotes',
  timestamps: true,
  underscored: true,
})
export class QuoteModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'quote_number' })
  declare quoteNumber: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'patient_id' })
  declare patientId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'lead_id' })
  declare leadId: string | null;

  @Default('draft')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATEONLY, allowNull: true, field: 'valid_until' })
  declare validUntil: Date | null;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare notes: string;

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'subtotal_usd' })
  declare subtotalUsd: string; // DECIMAL comes as string from pg driver

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'discount_usd' })
  declare discountUsd: string;

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'total_usd' })
  declare totalUsd: string;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true, field: 'bcv_rate' })
  declare bcvRate: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true, field: 'total_bs' })
  declare totalBs: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'sent_at' })
  declare sentAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @HasMany(() => QuoteItemModel, { foreignKey: 'quote_id', as: 'items' })
  declare items?: QuoteItemModel[];
}
