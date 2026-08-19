import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when the email provider rejects or fails to deliver the message.
 * Mapped to HTTP 502 by GlobalExceptionFilter (external dependency failure).
 *
 * SECURITY: Never include email body content or HTML in the error message —
 * the message field may appear in logs.
 */
export class EmailSendError extends DomainError {
  readonly code = 'EMAIL_SEND_FAILED';
  override readonly httpStatus = 502;

  constructor(cause?: string) {
    super(cause ? `No se pudo enviar el correo: ${cause}` : 'No se pudo enviar el correo');
  }
}
