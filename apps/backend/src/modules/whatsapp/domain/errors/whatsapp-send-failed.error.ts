import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the WhatsApp provider returns a non-retryable error.
 * Callers should log and continue — a failed WhatsApp reminder must never
 * abort the reminder dispatch loop.
 */
export class WhatsAppSendFailedError extends DomainError {
  readonly code = 'WHATSAPP_SEND_FAILED';

  constructor(reason: string) {
    super(`Error al enviar mensaje de WhatsApp: ${reason}`);
  }
}
