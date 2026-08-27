import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { OnboardingRequirementsNotMetError } from '../../../domain/errors/onboarding-requirements-not-met.error';

export interface CompleteOnboardingOutput {
  onboardingCompleted: boolean;
}

/**
 * Verifies that the doctor has the minimum requirements to complete onboarding
 * (≥1 active office AND ≥1 active service), then sets onboarding_completed_at.
 *
 * Idempotent: calling this multiple times is safe — if already completed, we
 * just update the timestamp (harmless). The UI should stop showing the gate
 * once onboardingCompleted = true.
 *
 * SECURITY: doctorId always comes from the authenticated token (anti-IDOR).
 */
@Injectable()
export class CompleteOnboardingUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string): Promise<CompleteOnboardingOutput> {
    // 1. Verify requirements in parallel — server-side validation cannot be bypassed.
    const [activeOffices, allPlans] = await Promise.all([
      this.officeRepo.findActiveByDoctor(doctorId),
      this.pricingPlanRepo.findAllByDoctorId(doctorId),
    ]);

    const hasActiveOffice = activeOffices.length > 0;
    const hasActiveService = allPlans.some((p) => p.isActive);

    if (!hasActiveOffice || !hasActiveService) {
      throw new OnboardingRequirementsNotMetError();
    }

    // 2. Mark onboarding as complete (idempotent).
    await this.profileRepo.markOnboardingCompleted(doctorId);

    return { onboardingCompleted: true };
  }
}
