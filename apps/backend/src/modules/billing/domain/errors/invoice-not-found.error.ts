import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an invoice cannot be found by the given id.
 * Maps to HTTP 404 via GlobalExceptionFilter.
 */
export class InvoiceNotFoundError extends DomainError {
  readonly code = 'INVOICE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id: string) {
    super(`Factura no encontrada: ${id}`);
  }
}
