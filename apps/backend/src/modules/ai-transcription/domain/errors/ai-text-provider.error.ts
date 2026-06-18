import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the external AI text provider returns an error or is unreachable.
 *
 * The message exposed to the client is always generic. Internal details are
 * stored in `internalDetail` for server-side logging only — never forwarded
 * to the HTTP response.
 */
export class AiTextProviderError extends DomainError {
  readonly code = 'AI_TEXT_PROVIDER_ERROR';
  override readonly httpStatus = 502;

  /** Internal diagnostic detail. Must NOT be forwarded to the HTTP response. */
  readonly internalDetail: string;

  constructor(internalDetail: string) {
    super('Servicio de IA temporalmente no disponible.');
    this.internalDetail = internalDetail;
  }
}
