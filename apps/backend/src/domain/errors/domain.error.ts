/**
 * Base class for all domain errors.
 *
 * Domain errors represent violations of business invariants and are mapped to
 * HTTP 422 (Unprocessable Entity) by the GlobalExceptionFilter by default.
 * Subclasses may override `httpStatus` to produce a different HTTP code
 * (e.g. 404 for resource-not-found errors on public surfaces).
 *
 * NEVER throw a raw `new Error('...')` from the domain or application layers —
 * extend this class so the error carries a stable, machine-readable `code`.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  /** Override to produce a non-422 HTTP response. Default: 422. */
  readonly httpStatus?: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain (required when extending built-ins under ES targets).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  constructor() {
    super('Not authorized to access this resource');
  }
}
