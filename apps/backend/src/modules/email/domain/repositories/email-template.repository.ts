import type { EmailTemplate } from '../entities/email-template.entity';

export const EMAIL_TEMPLATE_REPOSITORY = 'EMAIL_TEMPLATE_REPOSITORY' as const;

/**
 * IEmailTemplateRepository — read-only repository interface for email templates.
 *
 * Templates are managed directly in the database (no write endpoints).
 * This interface lives in domain/ and is implemented by the infrastructure layer.
 *
 * Only active templates are returned — inactive ones are considered disabled.
 */
export interface IEmailTemplateRepository {
  /**
   * Finds an active template by its logical name key (e.g. 'invoice').
   * Returns null when the template does not exist or is inactive.
   */
  findByName(name: string): Promise<EmailTemplate | null>;
}
