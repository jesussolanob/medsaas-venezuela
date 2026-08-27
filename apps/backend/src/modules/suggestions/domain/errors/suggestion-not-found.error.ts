import { DomainError } from '../../../../domain/errors/domain.error';

export class SuggestionNotFoundError extends DomainError {
  readonly code = 'SUGGESTION_NOT_FOUND';
  override readonly httpStatus = 404;

  // Intentionally generic — never include the ID to prevent resource enumeration.
  constructor() {
    super('Sugerencia no encontrada');
  }
}
