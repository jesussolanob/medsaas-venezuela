import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the external AI provider used by the help chat fails to respond.
 *
 * The public message is always generic (no internal details leaked).
 * Internal diagnostic context is stored in `internalDetail` and must only
 * appear in server-side logs — never forwarded to the HTTP response.
 *
 * Maps to HTTP 502 via GlobalExceptionFilter (httpStatus override).
 */
export class HelpChatProviderError extends DomainError {
  readonly code = 'HELP_CHAT_PROVIDER_ERROR';
  override readonly httpStatus = 502;

  /** Internal detail for server-side logging. NEVER send to the client. */
  readonly internalDetail: string;

  constructor(internalDetail: string) {
    super('El asistente de ayuda no está disponible en este momento. Intenta de nuevo más tarde.');
    this.internalDetail = internalDetail;
  }
}
