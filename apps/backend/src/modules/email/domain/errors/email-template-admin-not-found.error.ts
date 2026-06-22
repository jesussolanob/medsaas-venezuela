import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised by admin use-cases when a template name is not found.
 *
 * Distinct from EmailTemplateNotFoundError (which signals an internal system
 * misconfiguration and maps to HTTP 500) — this error represents a normal
 * "resource not found" condition for admin REST endpoints and maps to HTTP 404.
 */
export class EmailTemplateAdminNotFoundError extends DomainError {
  readonly code = 'EMAIL_TEMPLATE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(name: string) {
    super(`Email template '${name}' not found`);
  }
}
