import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';

/** Ordered onboarding steps for monotonic comparison. */
const STEP_ORDER = ['profile', 'office', 'service', 'completed'] as const;
type OnboardingStep = (typeof STEP_ORDER)[number];

function stepIndex(step: string | null): number {
  if (!step) return -1;
  return STEP_ORDER.indexOf(step as OnboardingStep);
}

export interface OnboardingProgressInput {
  doctorId: string;
  step: 'office' | 'service';
}

export interface OnboardingProgressOutput {
  lastStep: string;
}

/**
 * Advances the onboarding step tracker to `step` for the authenticated doctor.
 *
 * Rules:
 *  - Monotonic: the step can only advance, never go backward.
 *  - If `step` is already the current step or behind it, the call is a no-op
 *    (idempotent — safe to call multiple times).
 *  - 'completed' is set exclusively by CompleteOnboardingUseCase (not via this endpoint).
 */
@Injectable()
export class OnboardingProgressUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
  ) {}

  async execute(input: OnboardingProgressInput): Promise<OnboardingProgressOutput> {
    const profile = await this.profileRepo.findByDoctorId(input.doctorId);
    const currentStep = profile?.onboardingLastStep ?? null;

    const newIndex = stepIndex(input.step);
    const currentIndex = stepIndex(currentStep);

    if (newIndex <= currentIndex) {
      // Already at or past this step — idempotent no-op
      return { lastStep: currentStep ?? input.step };
    }

    await this.profileRepo.updateOnboardingState(input.doctorId, { lastStep: input.step });
    return { lastStep: input.step };
  }
}
