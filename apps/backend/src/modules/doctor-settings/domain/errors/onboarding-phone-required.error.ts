import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to complete onboarding but their profile has no
 * phone number (or an empty/whitespace-only one).
 *
 * HTTP 422 (inherited from DomainError).
 *
 * This is intentionally distinct from OnboardingRequirementsNotMetError so that
 * the frontend can route the doctor back to step 1 (profile data) rather than
 * to step 2/3 (offices / services).
 */
export class OnboardingPhoneRequiredError extends DomainError {
  readonly code = 'ONBOARDING_PHONE_REQUIRED';

  constructor() {
    super('Falta tu teléfono de contacto. Complétalo para activar tu cuenta.');
  }
}
