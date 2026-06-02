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
    );
  }

  /** Returns true when this transaction belongs to the given doctor. */
  isOwnedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }
}
