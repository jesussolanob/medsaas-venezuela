import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import {
  FinancialTransaction,
  type ExpenseConcept,
} from '../../../domain/entities/financial-transaction.entity';
import { Money, type Currency } from '../../../domain/value-objects/money.vo';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';

export interface RecordExpenseInput {
  doctorId: string;
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId?: string | null;
  date?: Date;
  /**
   * Optional expense category for breakdown reporting.
   * One of: rent | staff | supplies | services | taxes | other.
   * Expenses without a concept are surfaced as 'other' in summary breakdowns.
   */
  concept?: ExpenseConcept | null;
}

export interface RecordExpenseOutput {
  id: string;
  doctorId: string;
  type: 'expense';
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId: string | null;
  date: Date;
  createdAt: Date;
  /** Null for legacy expense rows or when not provided. */
  expense_concept: ExpenseConcept | null;
}

/**
 * Records a manual expense entry for a doctor.
 *
 * Validation: amount > 0 is enforced by the Money value object constructor.
 * The optional `concept` field classifies the expense for breakdown reporting.
 */
@Injectable()
export class RecordExpenseUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
  ) {}

  async execute(input: RecordExpenseInput): Promise<RecordExpenseOutput> {
    if (input.amount <= 0) {
      throw new InvalidAmountError(input.amount);
    }
    const money = new Money(input.amount, input.currency);

    const transaction = FinancialTransaction.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      type: 'expense',
      amount: money,
      description: input.description,
      relatedConsultationId: input.relatedConsultationId ?? null,
      date: input.date ?? new Date(),
      createdAt: new Date(),
      expenseConcept: input.concept ?? null,
    });

    const saved = await this.financeRepo.save(transaction);
    return this.toOutput(saved);
  }

  private toOutput(tx: FinancialTransaction): RecordExpenseOutput {
    return {
      id: tx.id,
      doctorId: tx.doctorId,
      type: 'expense',
      amount: tx.amount.amount,
      currency: tx.amount.currency,
      description: tx.description,
      relatedConsultationId: tx.relatedConsultationId,
      date: tx.date,
      createdAt: tx.createdAt,
      expense_concept: tx.expenseConcept,
    };
  }
}
