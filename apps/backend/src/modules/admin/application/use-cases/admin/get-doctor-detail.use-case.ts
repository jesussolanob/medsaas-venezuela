import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorDetail,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { GetFinancialSummaryUseCase } from '../../../../finances/application/use-cases/finances/get-financial-summary.use-case';

export interface GetDoctorDetailInput {
  doctorId: string;
}

/**
 * Returns the enriched detail of a single doctor including profile fields,
 * subscription data, activity status, and current-month stats.
 *
 * monthlyRevenue is fetched from GetFinancialSummaryUseCase so it uses the
 * same three income sources as the doctor's own Finanzas screen:
 *   1. approved consultation amounts
 *   2. manual income (financial_transactions type='income')
 *   3. orphan payments (quote acceptances / package sales without a linked consultation)
 *
 * This guarantees the admin and the doctor always see the same figure.
 *
 * Throws DoctorNotFoundError when no doctor profile with the given ID exists.
 */
@Injectable()
export class GetDoctorDetailUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    private readonly financeSummary: GetFinancialSummaryUseCase,
  ) {}

  async execute(input: GetDoctorDetailInput): Promise<DoctorDetail> {
    // Run both queries in parallel: profile/stats from admin repo and income
    // from the finances use case. Fail fast if the doctor does not exist.
    const [doctor, summary] = await Promise.all([
      this.adminRepo.findDoctorDetail(input.doctorId),
      // No explicit month — GetFinancialSummaryUseCase defaults to the current
      // UTC month, the same boundary used by monthBounds() in the finance repo.
      this.financeSummary.execute({ doctorId: input.doctorId }),
    ]);

    if (!doctor) throw new DoctorNotFoundError(input.doctorId);

    // Override monthlyRevenue with the figure from the finances use case.
    // The admin repo still returns patientCount and consultationCount from its
    // own SQL; only the revenue field is replaced here.
    return { ...doctor, monthlyRevenue: summary.totalIncome };
  }
}
