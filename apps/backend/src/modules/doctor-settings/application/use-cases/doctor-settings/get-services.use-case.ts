import { Inject, Injectable } from '@nestjs/common';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';

export interface GetServicesOptions {
  /**
   * When provided, returns only plans tied to this office PLUS general plans.
   * When absent, returns all plans for the doctor.
   */
  officeId?: string;
}

@Injectable()
export class GetServicesUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string, options?: GetServicesOptions): Promise<PricingPlan[]> {
    return this.pricingPlanRepo.findAllByDoctorId(doctorId, {
      officeId: options?.officeId,
    });
  }
}
