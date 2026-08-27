import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor submits a seller_code during onboarding that does not
 * match any active seller profile in the database.
 *
 * HTTP 422 (inherited from DomainError) — the request is structurally valid but
 * the code references something that does not exist, so the caller must correct
 * their input.
 *
 * NOTE: the error message is intentionally vague. Returning "code not found"
 * vs "code belongs to a deactivated seller" would leak internal state — both
 * cases are surfaced as the same error to the client.
 */
export class SellerCodeNotFoundError extends DomainError {
  readonly code = 'SELLER_CODE_NOT_FOUND';

  constructor() {
    super('El código de vendedor ingresado no existe o no es válido.');
  }
}
