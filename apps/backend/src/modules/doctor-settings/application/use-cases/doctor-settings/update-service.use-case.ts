import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { OfficeNotOwnedError } from '../../../domain/errors/office-not-owned.error';

@Injectable()
export class UpdateServiceUseCase {
  private readonly logger = new Logger(UpdateServiceUseCase.name);

  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
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

    // When switching to price_on_request, force priceUsd to 0 to avoid accidental charges
    const resolvedParams: PricingPlanUpdateParams =
      params.priceOnRequest === true ? { ...params, priceUsd: 0 } : params;

    const updated = await this.pricingPlanRepo.update(serviceId, resolvedParams);

    // Best-effort: clear the service-skipped flag so the onboarding checklist
    // recognises that the doctor has configured a real service.
    // A failure here must NOT roll back the successful update.
    try {
      await this.profileRepo.updateOnboardingState(doctorId, { serviceSkipped: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[update-service] failed to clear service_skipped flag for doctorId=${doctorId}: ${msg}`,
      );
    }

    return updated;
  }
}
