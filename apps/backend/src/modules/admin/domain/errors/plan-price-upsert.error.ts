import { DomainError } from '../../../../domain/errors/domain.error';

export class PlanPriceUpsertError extends DomainError {
  readonly code = 'PLAN_PRICE_UPSERT_FAILED';
  override readonly httpStatus = 500;

  constructor(planKey: string, period: string) {
    super(`No se pudo guardar el precio del plan '${planKey}' para el período '${period}'`);
  }
}
