import { Inject, Injectable } from '@nestjs/common';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
  type PricingPlanUpdateParams,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { DoctorServiceNotFoundError } from '../../../domain/errors/doctor-service-not-found.error';
import { DoctorServiceNotOwnedError } from '../../../domain/errors/doctor-service-not-owned.error';

@Injectable()
export class UpdateServiceUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(
    doctorId: string,
    serviceId: string,
    params: PricingPlanUpdateParams,
  ): Promise<PricingPlan> {
    const existing = await this.pricingPlanRepo.findById(serviceId);
    if (!existing) throw new DoctorServiceNotFoundError(serviceId);
    if (existing.doctorId !== doctorId) throw new DoctorServiceNotOwnedError();

    return this.pricingPlanRepo.update(serviceId, params);
  }
}
