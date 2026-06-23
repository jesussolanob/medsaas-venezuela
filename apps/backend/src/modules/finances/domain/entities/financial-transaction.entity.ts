import { Money } from '../value-objects/money.vo';

export type TransactionType = 'income' | 'expense';

/**
 * Domain entity representing a manual financial record (income or expense)
 * registered by a doctor.
 *
 * Consultation-derived income flows through GetFinancialSummaryUseCase via the
 * consultation repository — this entity represents only manual entries.
 */
export class FinancialTransaction {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly type: TransactionType,
    public readonly amount: Money,
    public readonly description: string,
    public readonly relatedConsultationId: string | null,
    public readonly date: Date,
    public readonly createdAt: Date,
    /** Nullable FK to income_concepts (income transactions only). */
    public readonly conceptId: string | null = null,
    /**
     * Nullable FK to patients.
     * Income + consultation link: derived from the consultation's patient_id.
     * Income without consultation: optionally supplied by the doctor (validated).
     * Expense: always null.
     */
    public readonly patientId: string | null = null,
  ) {}

  /** Factory for constructing a new (unpersisted) transaction. */
  static create(params: {
    id: string;
    doctorId: string;
    type: TransactionType;
    amount: Money;
    description: string;
    relatedConsultationId: string | null;
    date: Date;
    createdAt: Date;
    conceptId?: string | null;
    patientId?: string | null;
  }): FinancialTransaction {
    return new FinancialTransaction(
      params.id,
      params.doctorId,
      params.type,
      params.amount,
      params.description,
      params.relatedConsultationId,
      params.date,
      params.createdAt,
      params.conceptId ?? null,
      params.patientId ?? null,
    );
  }

  /** Returns true when this transaction belongs to the given doctor. */
  isOwnedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  /**
   * Returns a new transaction with the given editable fields patched (immutable).
   * type and doctorId cannot be changed.
   */
  patch(fields: {
    amount?: Money;
    description?: string;
    date?: Date;
    conceptId?: string | null;
    /** Pass undefined to keep existing patientId; null to unlink. */
    patientId?: string | null;
  }): FinancialTransaction {
    return new FinancialTransaction(
      this.id,
      this.doctorId,
      this.type,
      fields.amount ?? this.amount,
      fields.description ?? this.description,
      this.relatedConsultationId,
      fields.date ?? this.date,
      this.createdAt,
      fields.conceptId !== undefined ? fields.conceptId : this.conceptId,
      fields.patientId !== undefined ? fields.patientId : this.patientId,
    );
  }
}
