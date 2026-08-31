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

  /**
   * 503, NO 502.
   *
   * Cloudflare descarta el cuerpo de las respuestas 502 y 504 del origen y sirve
   * su propia página HTML de error (el pass-thru de errores de origen viene
   * apagado). Con 502 el navegador recibía HTML en vez de nuestro JSON, el
   * `res.json()` del frontend reventaba y el especialista terminaba viendo
   * "Error al conectar con la IA" en lugar del mensaje real.
   *
   * 503 pasa tal cual y además describe mejor lo que ocurre: el proveedor está
   * saturado y conviene reintentar.
   */
  override readonly httpStatus = 503;

  /** Internal diagnostic detail. Must NOT be forwarded to the HTTP response. */
  readonly internalDetail: string;

  constructor(internalDetail: string) {
    super('Servicio de IA temporalmente no disponible.');
    this.internalDetail = internalDetail;
  }
}
