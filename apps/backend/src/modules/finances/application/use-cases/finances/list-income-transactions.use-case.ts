import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
  type IncomeTransactionItem,
} from '../../../domain/repositories/finance.repository';
import {
  INCOME_TX_DEFAULT_LIMIT,
  INCOME_TX_MAX_LIMIT,
} from '../../constants/income-transactions.constants';

export interface ListIncomeTransactionsInput {
  doctorId: string;
  /** 'YYYY-MM' — when omitted, all income records are returned (up to limit). */
  month?: string;
  /** Maximum rows to return. Default 200. */
  limit?: number;
}

/** Shape returned to presentation layer and frontend. */
export type IncomeTransactionOutput = IncomeTransactionItem;

/**
 * Returns manual income transactions for the authenticated doctor.
 *
 * Designed for the finance chart on the doctor dashboard.
 * Patient names are decrypted within the doctor's scope — NEVER logged as PII.
 *
 * SECURITY:
 *   - doctorId comes from the authenticated token (anti-IDOR).
 *   - patientName is decrypted by the repo and only returned in-scope.
 *   - No PII appears in logs.
 */
@Injectable()
export class ListIncomeTransactionsUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
  ) {}

  async execute(input: ListIncomeTransactionsInput): Promise<IncomeTransactionOutput[]> {
    const rawLimit = input.limit ?? INCOME_TX_DEFAULT_LIMIT;
    const limit = Math.min(rawLimit, INCOME_TX_MAX_LIMIT);
    return this.financeRepo.listIncomeTransactions({
      doctorId: input.doctorId,
      month: input.month,
      limit,
    });
  }
}
