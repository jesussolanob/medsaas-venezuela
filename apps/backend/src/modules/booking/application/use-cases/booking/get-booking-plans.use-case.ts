import { Inject, Injectable } from '@nestjs/common';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { type PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';

/**
 * Returns pricing plans visible in the public booking widget for a given doctor.
 * Only plans with show_in_booking=true and is_active=true are returned.
 */
@Injectable()
export class GetBookingPlansUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string): Promise<PricingPlan[]> {
    return this.pricingPlanRepo.findPublicByDoctorId(doctorId);
  }
}
