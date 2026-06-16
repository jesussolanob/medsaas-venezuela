import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the external transcription provider returns an error or is unreachable.
 *
 * Constructor accepts an internal detail string used only for server-side logging.
 * The message exposed to the client is always generic — never includes provider
 * details, URLs, or API keys.
 */
export class TranscriptionProviderError extends DomainError {
  readonly code = 'TRANSCRIPTION_PROVIDER_ERROR';
  override readonly httpStatus = 502;

  /**
   * @param internalDetail — logged server-side only; NEVER sent to the client.
   */
  constructor(internalDetail: string) {
    // Generic client-facing message — detail is for the logger, not this string.
    super('Servicio de transcripción temporalmente no disponible.');
    // Store detail for callers that need it (e.g. adapter logger).
    this.internalDetail = internalDetail;
  }

  /** Internal diagnostic detail. Must NOT be forwarded to the HTTP response. */
  readonly internalDetail: string;
}

/**
 * Thrown when the transcription service is not configured (missing API key or
 * equivalent credential).
 *
 * Uses a generic code and message — the specific missing env var is logged
 * server-side by the adapter, never exposed to the client.
 */
export class TranscriptionNotConfiguredError extends DomainError {
  readonly code = 'TRANSCRIPTION_NOT_CONFIGURED';
  override readonly httpStatus = 500;

  constructor() {
    super('El servicio de transcripción no está configurado en este servidor.');
  }
}
