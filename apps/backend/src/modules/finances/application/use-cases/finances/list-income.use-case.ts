import { Inject, Injectable } from '@nestjs/common';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
  type UnifiedIncomeItem,
} from '../../../domain/repositories/finance.repository';

/** Maximum rows per page the caller may request. */
const MAX_LIMIT = 100;
/** Default page size when the caller omits the limit param. */
const DEFAULT_LIMIT = 20;

export interface ListIncomeInput {
  doctorId: string;
  /** 'YYYY-MM' — when omitted, all time records are returned (up to the page limit). */
  month?: string;
  page: number;
  limit: number;
}

export type IncomeListItemOutput = UnifiedIncomeItem;

export interface ListIncomeOutput {
  items: IncomeListItemOutput[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Returns a unified, paginated list of income from both sources:
 *  - `payments` (consultation income — approved + pending)
 *  - `financial_transactions` WHERE type='income' (manual income entries)
 *
 * Results are ordered by date DESC and paginated server-side (LIMIT/OFFSET).
 *
 * SECURITY:
 *  - doctorId is always taken from the authenticated token — never from the
 *    request body (anti-IDOR).
 *  - No patient PII (name, cedula, phone) is included in the output.
 *    Only patient_id is returned; the frontend resolves the display name
 *    through its own masked patient list if needed.
 */
@Injectable()
export class ListIncomeUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
  ) {}

  async execute(input: ListIncomeInput): Promise<ListIncomeOutput> {
    const page = Math.max(1, input.page);
    const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit || DEFAULT_LIMIT));

    return this.financeRepo.listIncomePaginated({
      doctorId: input.doctorId,
      month: input.month,
      page,
      limit,
    });
  }
}
