import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor requests checkout info for a plan/period combination
 * that does not exist or is not active in plan_prices.
 *
 * Maps to HTTP 422 (the default for DomainError).
 */
export class PlanNotFoundForCheckoutError extends DomainError {
  readonly code = 'PLAN_NOT_FOUND_FOR_CHECKOUT';

  constructor(planKey: string, period: string) {
    super(
      `El plan '${planKey}' con período '${period}' no está disponible para contratación. ` +
        `Verificá que el plan y el período sean correctos.`,
    );
  }
}
