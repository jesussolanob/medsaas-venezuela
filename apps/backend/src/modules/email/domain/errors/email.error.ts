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

  /**
   * Texto CRUDO del proveedor. Se guarda en `email_send_log.error_detail`, que
   * tiene el mismo control de acceso que el resto de la base — y NUNCA se pone
   * en `message`, que los llamadores interpolan en sus logs.
   *
   * Existe porque Resend devuelve la dirección rechazada dentro del mensaje de
   * error ("The <dirección> address is not verified"). Metido en `message`, el
   * correo de un paciente terminaba en Cloud Logging, que no está cifrado.
   */
  readonly detail: string | null;

  constructor(cause?: string, detail?: string) {
    super(cause ? `No se pudo enviar el correo: ${cause}` : 'No se pudo enviar el correo');
    this.detail = detail ?? null;
  }
}
