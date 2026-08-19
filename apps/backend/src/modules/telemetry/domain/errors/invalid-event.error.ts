import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an ActionEvent fails a structural/format validation that is
 * unrelated to PII detection (e.g. the `action` field is empty).
 *
 * Distinct from PiiInEventError: these are data-quality rejections, NOT
 * security rejections, and must NOT inflate the PII rejection counter.
 *
 * Maps to HTTP 422 (Unprocessable Entity) via the GlobalExceptionFilter.
 */
export class InvalidEventError extends DomainError {
  readonly code = 'INVALID_EVENT';
  override readonly httpStatus = 422;

  constructor(detail: string) {
    super(`Evento rechazado — formato inválido: ${detail}`);
  }
}
