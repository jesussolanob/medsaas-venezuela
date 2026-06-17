import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to create a service/plan but has no active offices.
 * A doctor must have at least one consultorio before adding plans.
 */
export class PlanRequiresOfficeError extends DomainError {
  readonly code = 'PLAN_REQUIRES_OFFICE';
  override readonly httpStatus = 422;

  constructor() {
    super('Debes crear al menos un consultorio antes de agregar planes.');
  }
}
