import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a requested email template does not exist or is inactive.
 *
 * Mapped to HTTP 500 by GlobalExceptionFilter because a missing template
 * indicates a misconfigured system (the template should always be seeded),
 * not a user error. Override httpStatus to 500 to signal internal failure.
 *
 * SECURITY: Do NOT include template content in the error message — it may
 * appear in logs.
 */
export class EmailTemplateNotFoundError extends DomainError {
  readonly code = 'EMAIL_TEMPLATE_NOT_FOUND';
  override readonly httpStatus = 500;

  constructor(name: string) {
    super(`Email template '${name}' not found or inactive`);
  }
}
