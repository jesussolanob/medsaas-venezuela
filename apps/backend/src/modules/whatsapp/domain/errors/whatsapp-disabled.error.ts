import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when WHATSAPP_ENABLED=false and a caller explicitly requests a send.
 * Under normal circumstances the adapter returns null silently — this error
 * is only raised when a caller explicitly checks for the disabled state.
 */
export class WhatsAppDisabledError extends DomainError {
  readonly code = 'WHATSAPP_DISABLED';

  constructor() {
    super('WhatsApp está deshabilitado en este entorno.');
  }
}
