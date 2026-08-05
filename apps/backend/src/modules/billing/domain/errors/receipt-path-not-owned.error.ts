import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor submits a receiptPath that does not start with
 * "receipt/{doctorId}/" — i.e., the file was uploaded under a different user's
 * namespace.
 *
 * This prevents a doctor from attaching another doctor's uploaded file to their
 * payment (object-level IDOR on GCS paths).
 *
 * Maps to HTTP 422 (default for DomainError).
 */
export class ReceiptPathNotOwnedError extends DomainError {
  readonly code = 'RECEIPT_PATH_NOT_OWNED';

  constructor() {
    super(
      'El comprobante adjuntado no corresponde a tu cuenta. ' +
        'Por favor, sube el archivo desde esta misma sesión antes de enviar el pago.',
    );
  }
}
