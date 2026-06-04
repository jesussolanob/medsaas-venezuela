import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { InvoiceStatus } from '../../../domain/entities/invoice.entity';

/**
 * Sequelize model for the `invoices` table.
 *
 * Platform invoices issued by super_admin to doctors for subscription billing.
 */
@Table({
  tableName: 'invoices',
  timestamps: true,
  underscored: true,
})
export class InvoiceModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, unique: true, field: 'invoice_number' })
  declare invoiceNumber: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: number;

  @Default('USD')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare currency: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Default('issued')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: InvoiceStatus;

  @Column({ type: DataType.DATE, allowNull: true, field: 'issued_at' })
  declare issuedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'sent_at' })
  declare sentAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'paid_at' })
  declare paidAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'created_by' })
  declare createdBy: string | null;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
