import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a content template does not exist or belongs to another doctor.
 * Intentionally generic — returns 404 so the caller cannot distinguish
 * missing vs. forbidden (anti-IDOR guarantee).
 */
export class ContentTemplateNotFoundError extends DomainError {
  readonly code = 'CONTENT_TEMPLATE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Plantilla de contenido no encontrada');
  }
}
