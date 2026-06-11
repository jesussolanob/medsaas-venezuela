import { Inject, Injectable } from '@nestjs/common';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
  type PricingPlanUpdateParams,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { DoctorServiceNotFoundError } from '../../../domain/errors/doctor-service-not-found.error';
import { DoctorServiceNotOwnedError } from '../../../domain/errors/doctor-service-not-owned.error';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import { OfficeNotOwnedError } from '../../../domain/errors/office-not-owned.error';

@Injectable()
export class UpdateServiceUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(
    doctorId: string,
    serviceId: string,
    params: PricingPlanUpdateParams,
  ): Promise<PricingPlan> {
    const existing = await this.pricingPlanRepo.findById(serviceId);
    if (!existing) throw new DoctorServiceNotFoundError(serviceId);
    if (existing.doctorId !== doctorId) throw new DoctorServiceNotOwnedError();

    // When office_id is being updated to a non-null value, validate ownership
    if ('officeId' in params && params.officeId !== null && params.officeId !== undefined) {
      const office = await this.officeRepo.findByIdForDoctor(params.officeId, doctorId);
      if (!office) throw new OfficeNotOwnedError();
    }

    return this.pricingPlanRepo.update(serviceId, params);
  }
}
