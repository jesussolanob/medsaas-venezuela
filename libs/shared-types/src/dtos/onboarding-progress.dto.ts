import { z } from 'zod';

/**
 * Body for POST /api/doctor/onboarding/progress — advance the onboarding step
 * tracker to the next step (monotonic — never goes backwards).
 *
 * Acceptable values:
 *   'office'  — the doctor has started configuring their office/consultorio.
 *   'service' — the doctor has started configuring their service/pricing plan.
 *
 * 'completed' is set exclusively by POST /api/doctor/onboarding/complete and
 * cannot be submitted through this endpoint.
 */
export const OnboardingProgressDtoSchema = z
  .object({
    step: z.enum(['office', 'service']),
  })
  .strict();

export type OnboardingProgressDto = z.infer<typeof OnboardingProgressDtoSchema>;
