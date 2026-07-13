import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import type {
  FinancialTransaction,
  ExpenseConcept,
} from '../../../domain/entities/financial-transaction.entity';

export interface ListTransactionsInput {
  doctorId: string;
  month?: string; // 'YYYY-MM'
  page: number;
  limit: number;
}

export interface TransactionItem {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  relatedConsultationId: string | null;
  date: Date;
  createdAt: Date;
  /**
   * Expense category — populated only for expense-type rows.
   * Null for income rows and legacy expense rows (no concept was set).
   */
  expense_concept: ExpenseConcept | null;
}

export interface ListTransactionsOutput {
  items: TransactionItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListTransactionsUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
  ) {}

  async execute(input: ListTransactionsInput): Promise<ListTransactionsOutput> {
    const result = await this.financeRepo.list({
      doctorId: input.doctorId,
      month: input.month,
      page: input.page,
      limit: input.limit,
    });

    return {
      items: result.items.map((tx) => this.toItem(tx)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  private toItem(tx: FinancialTransaction): TransactionItem {
    return {
      id: tx.id,
      type: tx.type,
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
