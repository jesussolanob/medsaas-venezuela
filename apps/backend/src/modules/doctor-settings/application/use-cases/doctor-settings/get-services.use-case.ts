import { Inject, Injectable } from '@nestjs/common';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';

@Injectable()
export class GetServicesUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string): Promise<PricingPlan[]> {
    return this.pricingPlanRepo.findAllByDoctorId(doctorId);
  }
}
