import type { EmailTemplate } from '../entities/email-template.entity';

export const EMAIL_TEMPLATE_REPOSITORY = 'EMAIL_TEMPLATE_REPOSITORY' as const;

/** Fields that an admin may update on an existing template. */
export interface EmailTemplateUpdateFields {
  subject?: string;
  html?: string;
  text?: string | null;
  isActive?: boolean;
}

/**
 * IEmailTemplateRepository — repository interface for email templates.
 *
 * Read path: used by MailerService at send time.
 * Write path: used by admin use-cases to edit existing templates.
 *
 * Creating or deleting templates is NOT supported — the template set is fixed
 * by the application code that references them by name.
 */
export interface IEmailTemplateRepository {
  /**
   * Finds an active template by its logical name key (e.g. 'invoice').
   * Returns null when the template does not exist or is inactive.
   */
  findByName(name: string): Promise<EmailTemplate | null>;

  /**
   * Returns ALL templates (active and inactive) ordered by name ASC.
   * Intended for admin listing — callers must not filter by isActive.
   */
  findAll(): Promise<EmailTemplate[]>;

  /**
   * Applies a partial update to the template identified by name.
   * Only the supplied fields are changed; omitted fields retain their values.
   *
   * Throws EmailTemplateNotFoundError when no template exists with that name.
   */
  update(name: string, fields: EmailTemplateUpdateFields): Promise<EmailTemplate>;
}
