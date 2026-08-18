import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller asks for a specialist that does not exist OR belongs to
 * a different seller.
 *
 * HTTP 422 (inherited from DomainError).
 *
 * NOTE: los dos casos —inexistente y ajeno— devuelven EXACTAMENTE este error,
 * a propósito: distinguirlos permitiría a un vendedor enumerar la cartera de
 * otro probando ids.
 *
 * Existe como error propio porque antes se reutilizaba `SellerCodeNotFoundError`
 * acá: el bloqueo era correcto, pero el vendedor leía "El código de vendedor
 * ingresado no existe" al abrir una ficha, que no tiene nada que ver con lo que
 * estaba haciendo.
 */
export class SpecialistNotInPortfolioError extends DomainError {
  readonly code = 'SPECIALIST_NOT_IN_PORTFOLIO';

  constructor() {
    super('Ese especialista no está en tu cartera.');
  }
}
