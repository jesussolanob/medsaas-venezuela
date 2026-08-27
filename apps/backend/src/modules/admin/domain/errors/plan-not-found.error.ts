import { DomainError } from '../../../../domain/errors/domain.error';

export class PlanNotFoundError extends DomainError {
  readonly code = 'PLAN_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(planKey?: string) {
    super(planKey ? `Plan '${planKey}' no encontrado` : 'Plan no encontrado');
  }
}
