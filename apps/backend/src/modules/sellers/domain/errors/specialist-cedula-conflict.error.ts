import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller tries to invite a specialist whose cédula is already
 * registered in the system.
 *
 * HTTP 409 Conflict — the cédula already exists.
 *
 * NOTE: The cédula value is intentionally omitted from the message to reduce
 * the risk of PII leaking into error responses logged by monitoring systems.
 */
export class SpecialistCedulaConflictError extends DomainError {
  readonly code = 'SPECIALIST_CEDULA_CONFLICT';
  override readonly httpStatus = 409;

  constructor() {
    super('Esta cédula ya está registrada en el sistema.');
  }
}
