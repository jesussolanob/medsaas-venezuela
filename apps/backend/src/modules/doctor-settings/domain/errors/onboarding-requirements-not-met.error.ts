import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to complete onboarding but has not yet
 * created at least one active office AND at least one active service.
 *
 * HTTP 422 (inherited from DomainError).
 */
export class OnboardingRequirementsNotMetError extends DomainError {
  readonly code = 'ONBOARDING_REQUIREMENTS_NOT_MET';

  constructor() {
    super('Debes crear al menos un consultorio y un servicio para continuar');
  }
}
