import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when the requested plan_id does not exist or belongs to a different doctor.
 * Anti-IDOR: identical error for both cases so callers cannot enumerate plans.
 */
export class PlanNotOwnedError extends DomainError {
  override readonly code = 'PLAN_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_planId?: string) {
    super('Plan not found');
  }
}
