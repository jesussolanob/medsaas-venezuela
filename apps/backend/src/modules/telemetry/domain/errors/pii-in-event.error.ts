import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an ActionEvent contains data matching a PII pattern
 * or a prohibited key name.
 *
 * Maps to HTTP 422 (Unprocessable Entity) via the GlobalExceptionFilter.
 */
export class PiiInEventError extends DomainError {
  readonly code = 'PII_IN_EVENT';

  constructor(detail: string) {
    super(`Evento rechazado — posible dato sensible detectado: ${detail}`);
  }
}
