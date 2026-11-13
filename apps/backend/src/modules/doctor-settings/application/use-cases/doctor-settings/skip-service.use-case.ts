import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { CreateServiceUseCase } from './create-service.use-case';

export interface SkipServiceOutput {
  serviceSkipped: boolean;
  lastStep: string;
  /** Id of the default service created (new) or the existing active service's id. */
  serviceId: string | null;
}

/**
 * Handles the "Omitir" button on the Service step of the minimum onboarding wizard.
 *
 * Behavior:
 *  1. If the doctor already has at least one active service, no default is created
 *     (idempotent). The step is still marked as reached and skipped.
 *  2. If no active service exists, creates a default one:
 *     - Name: "Consulta"
 *     - price_on_request = true (no fixed price)
 *     - duration: 50 min, sessions_count: 1
 *     - type: 'plan', show_in_booking: true
 *     - office_id: doctor's first active office (null if none — general plan)
 *  3. Sets onboarding_service_skipped = true and advances step to 'service'.
 *
 * Idempotent: safe to call multiple times.
 *
 * SECURITY: doctorId always comes from the authenticated token (anti-IDOR).
 */
@Injectable()
export class SkipServiceUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
    private readonly createService: CreateServiceUseCase,
  ) {}

  async execute(doctorId: string): Promise<SkipServiceOutput> {
    const allPlans = await this.pricingPlanRepo.findAllByDoctorId(doctorId);
    const activePlan = allPlans.find((p) => p.isActive);

    let serviceId: string | null = activePlan?.id ?? null;

    if (!serviceId) {
      // No active service — create a default "Consulta" with price_on_request.
      // Note: CreateServiceUseCase requires the doctor to have at least one active office.
      // The skip-office step runs before skip-service, so an office should exist by now.
      // If not, the create call will throw PlanRequiresOfficeError — which is correct:
      // the doctor must have an office before they can have a service.
      const created = await this.createService.execute(doctorId, {
        name: 'Consulta',
        priceUsd: 0, // ignored — price_on_request=true forces 0
        priceOnRequest: true,
        durationMinutes: 50,
        sessionsCount: 1,
        type: 'plan',
        showInBooking: true,
        officeId: null, // general plan — usable at all offices
      });
      serviceId = created.id;
    }

    // Advance step tracker and mark as skipped (atomic).
    await this.profileRepo.updateOnboardingState(doctorId, {
      lastStep: 'service',
      serviceSkipped: true,
    });

    return { serviceSkipped: true, lastStep: 'service', serviceId };
  }
}
