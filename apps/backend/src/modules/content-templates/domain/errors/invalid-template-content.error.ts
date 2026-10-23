import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the content payload does not match the template's stored type.
 * Returns 422 Unprocessable Entity (default DomainError behavior).
 *
 * Example: sending paraclinical content to a recipe template.
 */
export class InvalidTemplateContentError extends DomainError {
  readonly code = 'INVALID_TEMPLATE_CONTENT';

  constructor(templateType: string) {
    super(`El contenido no es válido para una plantilla de tipo '${templateType}'`);
  }
}
