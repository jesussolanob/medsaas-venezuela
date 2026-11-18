/**
 * Shared onboarding-step derivation.
 *
 * Both the admin CSV export and the seller specialist list need to show
 * "how far along the onboarding wizard is a given specialist". The derivation
 * logic lives here — one place — and both modules import and call it.
 *
 * Pure function: no side effects, no external dependencies, no framework
 * imports. Safe to use in domain/, application/, or infrastructure/ layers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Stable machine key for the specialist's onboarding step.
 *
 * Labels (es-VE):
 *   completed      → Completado
 *   service        → Servicio
 *   office         → Consultorio
 *   profile        → Perfil
 *   no_data        → Sin completar datos
 *   never_signed_in→ Nunca ingresó
 */
export type OnboardingStepKey =
  | 'completed'
  | 'service'
  | 'office'
  | 'profile'
  | 'no_data'
  | 'never_signed_in';

/** Input contract for deriveOnboardingStep. */
export interface OnboardingStepInput {
  /** profiles.onboarding_last_step — null on legacy rows that never touched the wizard. */
  onboardingLastStep: string | null;
  /** profiles.onboarding_completed. */
  onboardingCompleted: boolean;
  /** profiles.onboarding_office_skipped. */
  onboardingOfficeSkipped: boolean;
  /** profiles.onboarding_service_skipped. */
  onboardingServiceSkipped: boolean;
  /** Count of active pricing_plans (is_active = true). */
  serviceCount: number;
  /** Count of active doctor_offices (is_active = true). */
  officeCount: number;
  /** profiles.cedula — null when never filled in. */
  cedula: string | null;
  /** profiles.specialty — null when never filled in. */
  specialty: string | null;
  /** profiles.last_sign_in_at — null when the account was never used. */
  lastSignInAt: Date | null;
}

// ---------------------------------------------------------------------------
// Pure derivation function
// ---------------------------------------------------------------------------

/**
 * Returns the machine key representing the specialist's farthest onboarding step.
 *
 * Priority order (matches the admin CSV column "Último paso del onboarding"):
 *   1. If onboarding_last_step is recorded, trust it.
 *   2. Otherwise, infer from what the specialist actually configured.
 *
 * The "skipped" flags are NOT part of the machine key — they are decoration
 * that callers may append to the label (e.g. "Consultorio (omitido)"). That
 * keeps this function's output stable and easy to map.
 */
export function deriveOnboardingStep(input: OnboardingStepInput): OnboardingStepKey {
  const {
    onboardingLastStep,
    onboardingCompleted,
    serviceCount,
    officeCount,
    cedula,
    specialty,
    lastSignInAt,
  } = input;

  // Explicit wizard position recorded on the profile row.
  if (onboardingLastStep) {
    if (onboardingLastStep === 'completed') return 'completed';
    if (onboardingLastStep === 'service') return 'service';
    if (onboardingLastStep === 'office') return 'office';
    if (onboardingLastStep === 'profile') return 'profile';
    // Unknown future values: treat as profile-level (safest conservative fallback).
    return 'profile';
  }

  // Legacy / inferred derivation for rows that predate the wizard tracking column.
  if (onboardingCompleted) return 'completed';
  if (serviceCount > 0) return 'service';
  if (officeCount > 0) return 'office';
  if (cedula && specialty) return 'profile';
  return lastSignInAt ? 'no_data' : 'never_signed_in';
}

// ---------------------------------------------------------------------------
// Label map (es-VE)
// ---------------------------------------------------------------------------

/**
 * Spanish label for each machine key, used by the admin CSV column.
 * Does NOT include the "(omitido)" suffix — callers append it when needed.
 */
export const ONBOARDING_STEP_LABEL_ES: Record<OnboardingStepKey, string> = {
  completed: 'Completado',
  service: 'Servicio',
  office: 'Consultorio',
  profile: 'Perfil',
  no_data: 'Sin completar datos',
  never_signed_in: 'Nunca ingresó',
};
