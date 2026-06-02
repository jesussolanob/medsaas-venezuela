import { Inject, Injectable } from '@nestjs/common';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { DoctorServiceNotFoundError } from '../../../domain/errors/doctor-service-not-found.error';
import { DoctorServiceNotOwnedError } from '../../../domain/errors/doctor-service-not-owned.error';

@Injectable()
export class DeleteServiceUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string, serviceId: string): Promise<void> {
    const existing = await this.pricingPlanRepo.findById(serviceId);
    if (!existing) throw new DoctorServiceNotFoundError(serviceId);
    if (existing.doctorId !== doctorId) throw new DoctorServiceNotOwnedError();

    await this.pricingPlanRepo.delete(serviceId);
  }
}
