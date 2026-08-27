import { DomainError } from '../../../../domain/errors/domain.error';

export class TemplateNotFoundError extends DomainError {
  readonly code = 'TEMPLATE_NOT_FOUND';
  override readonly httpStatus = 404;

  // Intentionally generic — never include the ID to prevent resource enumeration.
  constructor() {
    super('Plantilla no encontrada');
  }
}
