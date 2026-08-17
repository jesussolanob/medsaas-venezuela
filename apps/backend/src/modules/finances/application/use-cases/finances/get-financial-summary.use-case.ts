import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
  type IncomeSummaryBreakdown,
  type ExpenseSummaryBreakdown,
} from '../../../domain/repositories/finance.repository';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

export interface GetFinancialSummaryInput {
  doctorId: string;
  /** 'YYYY-MM' — defaults to current month when omitted. */
  month?: string;
}

export interface GetFinancialSummaryOutput {
  totalIncome: number;
  totalExpenses: number;
  /** Net = totalIncome - totalExpenses. Can be negative when expenses exceed income. */
  net: number;
  consultationCount: number;
  pendingAmount: number;
  /**
   * Net converted to bolivares at the current rate.
   * Carries the same sign as `net` (negative when month is in deficit).
   * Null when no rate has been configured.
   */
  netBS: number | null;
  currency: 'USD';
  rateUsed: number | null;
  month: string;
  /**
   * Granular income breakdown for chart / table rendering.
   * All values in USD and always >= 0.
   */
  incomeBreakdown: IncomeSummaryBreakdown;
  /**
   * Expense breakdown by category.
   * All six categories are always present (zero-filled when no rows exist).
   * Legacy rows without a concept are accumulated under 'other'.
   */
  expenseBreakdown: ExpenseSummaryBreakdown;
}

/**
 * Computes the financial summary for a doctor in a given month.
 *
 * Income = sum of approved consultation amounts + sum of manual income entries.
 * Expenses = sum of expense entries.
 * Net = Income - Expenses — reflects the real signed result (negative = deficit month).
 *
 * totalIncome and totalExpenses are always >= 0 (they are sums of positive amounts).
 * net is a plain signed number computed from those two sums; it does NOT go through
 * the Money constructor (which rejects negatives) because the net position itself
 * is legitimately negative when a month runs a deficit.
 *
 * All monetary calculations are in USD. BS conversion is informational only.
 *
 * CAMBIO 3 (2026-07-12): now also returns incomeBreakdown and expenseBreakdown
 * so the frontend can render granular charts without a separate endpoint.
 */
@Injectable()
export class GetFinancialSummaryUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(input: GetFinancialSummaryInput): Promise<GetFinancialSummaryOutput> {
    const month = input.month ?? this.currentMonth();

    // sumManualIncome is intentionally NOT called here. totalIncome is derived from
    // incomeBreakdown so both values always share the same source and cannot contradict
    // each other in the UI (the "two queries for the same number" pattern that produced
    // the $25 vs $0 bug when the frontend mixed client-side and backend totals).
    const [consultationSummary, expenses, rate, incomeBreakdown, expenseBreakdown] =
      await Promise.all([
        this.financeRepo.getConsultationSummary(input.doctorId, month),
        this.financeRepo.sumExpenses(input.doctorId, month),
        this.rateStore.getRate(),
        this.financeRepo.getIncomeBreakdown(input.doctorId, month),
        this.financeRepo.getExpenseBreakdown(input.doctorId, month),
      ]);

    // One source of truth: totalIncome = approved consultations + manual income,
    // both from the same getIncomeBreakdown query. This guarantees totalIncome and
    // incomeBreakdown.manualIncome are always consistent in every API response.
    const totalIncome = incomeBreakdown.consultationsApproved + incomeBreakdown.manualIncome;
    const totalExpenses = expenses.total;
    // Net is signed: negative when expenses exceed income (deficit month).
    const net = parseFloat((totalIncome - totalExpenses).toFixed(2));
    const netBS = rate !== null ? parseFloat((net * rate).toFixed(2)) : null;

    return {
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      net,
      consultationCount: consultationSummary.approvedCount,
      pendingAmount: parseFloat(consultationSummary.pendingTotal.toFixed(2)),
      netBS,
      currency: 'USD',
      rateUsed: rate,
      month,
      incomeBreakdown,
      expenseBreakdown,
    };
  }

  private currentMonth(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
