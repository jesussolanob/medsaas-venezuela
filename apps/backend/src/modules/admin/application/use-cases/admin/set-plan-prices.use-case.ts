import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanPriceRow,
  type SetPlanPriceParams,
} from '../../../domain/repositories/admin.repository';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';
import type { BillingPeriod } from '../../../domain/value-objects/plan-price.vo';

export interface SetPlanPricesInput {
  planKey: string;
  prices: Array<{
    period: BillingPeriod;
    priceUsd: number;
    isActive: boolean;
  }>;
}

@Injectable()
export class SetPlanPricesUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: SetPlanPricesInput): Promise<PlanPriceRow[]> {
    const plan = await this.adminRepo.findPlanByKey(input.planKey);
    if (!plan) throw new PlanNotFoundError(input.planKey);

    const params: SetPlanPriceParams[] = input.prices.map((p) => ({
      planKey: input.planKey,
      period: p.period,
      priceUsd: p.priceUsd,
      isActive: p.isActive,
    }));

    return this.adminRepo.setPlanPrices(input.planKey, params);
  }
}
