import { DomainError } from '../../../../domain/errors/domain.error';

export class PlanConflictError extends DomainError {
  readonly code = 'PLAN_CONFLICT';
  override readonly httpStatus = 409;

  constructor(planKey: string) {
    super(`El plan '${planKey}' ya existe`);
  }
}
