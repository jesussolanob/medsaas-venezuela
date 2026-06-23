import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `financial_transactions` table.
 *
 * Maps to: migracion/03b-schema-real.md (finances section) +
 * migration 20260602000004-finances.cjs
 * Extended by: 20260617000002-income-concepts.cjs (concept_id)
 *              20260617000003-financial-transactions-updated-at.cjs (updated_at)
 *              20260623000000-financial-transactions-patient-id.cjs (patient_id)
 *
 * No business logic here — pure ORM mapping. All domain logic lives in
 * FinancialTransaction entity and use cases.
 */
@Table({
  tableName: 'financial_transactions',
  timestamps: true,
  underscored: true,
})
export class FinancialTransactionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  declare type: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: number;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'USD' })
  declare currency: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'related_consultation_id' })
  declare relatedConsultationId: string | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'transaction_date' })
  declare transactionDate: Date;

  /** Nullable FK to income_concepts — set only for income-type rows. */
  @Column({ type: DataType.UUID, allowNull: true, field: 'concept_id' })
  declare conceptId: string | null;

  /**
   * Nullable FK to patients — set only for income-type rows.
   * Derived from the linked consultation when relatedConsultationId is present;
   * otherwise supplied by the doctor (validated for ownership before persist).
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'patient_id' })
  declare patientId: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
