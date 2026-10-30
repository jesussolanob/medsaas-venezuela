import { DomainError } from '../../../../domain/errors/domain.error';
import type { ContactRequestStatus } from '../entities/contact-request.entity';

/**
 * Thrown when an invalid status transition is attempted on a contact request.
 * HTTP 422.
 */
export class InvalidContactRequestTransitionError extends DomainError {
  readonly code = 'INVALID_CONTACT_REQUEST_TRANSITION';

  constructor(from: ContactRequestStatus, to: ContactRequestStatus) {
    super(`No se puede cambiar el estado de '${from}' a '${to}'.`);
  }
}
