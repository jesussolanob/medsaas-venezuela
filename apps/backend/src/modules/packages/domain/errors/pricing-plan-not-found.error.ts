import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a pricing plan cannot be found by the given ID. */
export class PricingPlanNotFoundError extends DomainError {
  readonly code = 'PRICING_PLAN_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_planId?: string) {
    super('Pricing plan not found');
  }
}
