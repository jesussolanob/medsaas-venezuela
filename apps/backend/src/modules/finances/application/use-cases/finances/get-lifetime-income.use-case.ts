import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

export interface GetLifetimeIncomeOutput {
  /** All-time total income in USD (approved consultations + manual income). */
  totalUsd: number;
  /** Total converted to Bs at the current rate. Null when no rate is configured. */
  totalBs: number | null;
  /** Number of approved consultation records included. */
  consultationCount: number;
  /** Exchange rate used for BS conversion. Null when unavailable. */
  rateUsed: number | null;
}

/**
 * Returns all-time income totals for the doctor (no month scope).
 *
 * Combines:
 *   - Approved consultations (consultations.amount WHERE payment_status='approved')
 *   - Manual income entries (financial_transactions WHERE type='income')
 */
@Injectable()
export class GetLifetimeIncomeUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(doctorId: string): Promise<GetLifetimeIncomeOutput> {
    const [{ total, consultationCount }, rate] = await Promise.all([
      this.financeRepo.lifetimeIncome(doctorId),
      this.rateStore.getRate(),
    ]);

    const totalBs = rate !== null ? parseFloat((total * rate).toFixed(2)) : null;

    return {
      totalUsd: total,
      totalBs,
      consultationCount,
      rateUsed: rate,
    };
  }
}
