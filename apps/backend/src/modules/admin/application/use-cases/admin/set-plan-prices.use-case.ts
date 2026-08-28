import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanPriceRow,
  type SetPlanPriceParams,
} from '../../../domain/repositories/admin.repository';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';
import { CompareAtPriceInvalidError } from '../../../domain/errors/compare-at-price-invalid.error';
import type { BillingPeriod } from '../../../domain/value-objects/plan-price.vo';

export interface SetPlanPricesInput {
  planKey: string;
  prices: Array<{
    period: BillingPeriod;
    priceUsd: number;
    isActive: boolean;
    /** Reference price shown crossed-out beside the real price. Null = no promotion. */
    compareAtPrice?: number | null;
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

    // Validate compare_at_price: when set, it must be strictly greater than
    // the real price. A "tachado" cheaper than the real price is a data-entry
    // error — reject it immediately so the admin sees a clear error message.
    for (const p of input.prices) {
      if (p.compareAtPrice != null && p.compareAtPrice <= p.priceUsd) {
        throw new CompareAtPriceInvalidError(p.period);
      }
    }

    const params: SetPlanPriceParams[] = input.prices.map((p) => ({
      planKey: input.planKey,
      period: p.period,
      priceUsd: p.priceUsd,
      isActive: p.isActive,
      compareAtPrice: p.compareAtPrice ?? null,
    }));

    return this.adminRepo.setPlanPrices(input.planKey, params);
  }
}
