import { deriveOnboardingStep, ONBOARDING_STEP_LABEL_ES } from './onboarding-step';
import type { OnboardingStepInput } from './onboarding-step';

function makeInput(overrides: Partial<OnboardingStepInput> = {}): OnboardingStepInput {
  return {
    onboardingLastStep: null,
    onboardingCompleted: false,
    onboardingOfficeSkipped: false,
    onboardingServiceSkipped: false,
    serviceCount: 0,
    officeCount: 0,
    cedula: 'V-12345678',
    specialty: 'Cardiología',
    lastSignInAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('deriveOnboardingStep', () => {
  // ---------------------------------------------------------------------------
  // Explicit onboarding_last_step (wizard-tracked rows)
  // ---------------------------------------------------------------------------

  it('returns "completed" when onboardingLastStep = "completed"', () => {
    expect(deriveOnboardingStep(makeInput({ onboardingLastStep: 'completed' }))).toBe('completed');
  });

  it('returns "service" when onboardingLastStep = "service"', () => {
    expect(deriveOnboardingStep(makeInput({ onboardingLastStep: 'service' }))).toBe('service');
  });

  it('returns "office" when onboardingLastStep = "office"', () => {
    expect(deriveOnboardingStep(makeInput({ onboardingLastStep: 'office' }))).toBe('office');
  });

  it('returns "profile" when onboardingLastStep = "profile"', () => {
    expect(deriveOnboardingStep(makeInput({ onboardingLastStep: 'profile' }))).toBe('profile');
  });

  it('returns "profile" for unknown onboardingLastStep values (safe fallback)', () => {
    expect(deriveOnboardingStep(makeInput({ onboardingLastStep: 'unknown_step' }))).toBe('profile');
  });

  // ---------------------------------------------------------------------------
  // Legacy derivation (onboarding_last_step IS NULL)
  // ---------------------------------------------------------------------------

  it('returns "completed" when onboardingCompleted = true (legacy)', () => {
    expect(
      deriveOnboardingStep(makeInput({ onboardingLastStep: null, onboardingCompleted: true })),
    ).toBe('completed');
  });

  it('returns "service" when serviceCount > 0 and not completed (legacy)', () => {
    expect(
      deriveOnboardingStep(
        makeInput({ onboardingLastStep: null, onboardingCompleted: false, serviceCount: 1 }),
      ),
    ).toBe('service');
  });

  it('returns "office" when officeCount > 0 and no service (legacy)', () => {
    expect(
      deriveOnboardingStep(
        makeInput({
          onboardingLastStep: null,
          onboardingCompleted: false,
          serviceCount: 0,
          officeCount: 1,
        }),
      ),
    ).toBe('office');
  });

  it('returns "profile" when cedula + specialty are set but no office/service (legacy)', () => {
    expect(
      deriveOnboardingStep(
        makeInput({
          onboardingLastStep: null,
          onboardingCompleted: false,
          serviceCount: 0,
          officeCount: 0,
          cedula: 'V-12345678',
          specialty: 'Cardiología',
        }),
      ),
    ).toBe('profile');
  });

  it('returns "no_data" when signed in but profile incomplete (legacy)', () => {
    expect(
      deriveOnboardingStep(
        makeInput({
          onboardingLastStep: null,
          onboardingCompleted: false,
          serviceCount: 0,
          officeCount: 0,
          cedula: null,
          specialty: null,
          lastSignInAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ),
    ).toBe('no_data');
  });

  it('returns "never_signed_in" when lastSignInAt is null and no data (legacy)', () => {
    expect(
      deriveOnboardingStep(
        makeInput({
          onboardingLastStep: null,
          onboardingCompleted: false,
          serviceCount: 0,
          officeCount: 0,
          cedula: null,
          specialty: null,
          lastSignInAt: null,
        }),
      ),
    ).toBe('never_signed_in');
  });

  // ---------------------------------------------------------------------------
  // Explicit step takes priority over legacy counts
  // ---------------------------------------------------------------------------

  it('trusts onboardingLastStep over legacy counts when both are present', () => {
    // Even if the counts suggest "service", the explicit step wins.
    expect(
      deriveOnboardingStep(
        makeInput({ onboardingLastStep: 'profile', serviceCount: 5, onboardingCompleted: false }),
      ),
    ).toBe('profile');
  });
});

// ---------------------------------------------------------------------------
// ONBOARDING_STEP_LABEL_ES
// ---------------------------------------------------------------------------

describe('ONBOARDING_STEP_LABEL_ES', () => {
  it('provides a Spanish label for every OnboardingStepKey', () => {
    const keys = [
      'completed',
      'service',
      'office',
      'profile',
      'no_data',
      'never_signed_in',
    ] as const;

    for (const key of keys) {
      expect(typeof ONBOARDING_STEP_LABEL_ES[key]).toBe('string');
      expect(ONBOARDING_STEP_LABEL_ES[key].length).toBeGreaterThan(0);
    }
  });

  it('maps "completed" to "Completado"', () => {
    expect(ONBOARDING_STEP_LABEL_ES['completed']).toBe('Completado');
  });

  it('maps "never_signed_in" to "Nunca ingresó"', () => {
    expect(ONBOARDING_STEP_LABEL_ES['never_signed_in']).toBe('Nunca ingresó');
  });

  it('maps "no_data" to "Sin completar datos"', () => {
    expect(ONBOARDING_STEP_LABEL_ES['no_data']).toBe('Sin completar datos');
  });
});
