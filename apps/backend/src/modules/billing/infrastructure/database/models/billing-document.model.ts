import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { BillingDocumentItem } from '../../../domain/entities/billing-document.entity';

/**
 * Sequelize model for the `billing_documents` table.
 *
 * Stores fiscal documents (facturas, notas de débito, recibos) per doctor.
 * Items are stored as JSONB.
 */
@Table({
  tableName: 'billing_documents',
  timestamps: true,
  underscored: true,
})
export class BillingDocumentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'doc_number' })
  declare docNumber: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'doc_type' })
  declare docType: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'consultation_id' })
  declare consultationId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'payment_id' })
  declare paymentId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'patient_id' })
  declare patientId: string | null;

  @Default([])
  @Column({ type: DataType.JSONB, allowNull: false })
  declare items: BillingDocumentItem[];

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  declare subtotal: number | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
  declare total: number;

  @Default(0)
  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, field: 'iva_amount' })
  declare ivaAmount: number;

  @Default(0)
  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, field: 'igtf_amount' })
  declare igtfAmount: number;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true, field: 'bcv_rate' })
  declare bcvRate: number | null;

  @Column({ type: DataType.DECIMAL(16, 2), allowNull: true, field: 'total_bs' })
  declare totalBs: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Default('USD')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare currency: string;

  @Default('issued')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
