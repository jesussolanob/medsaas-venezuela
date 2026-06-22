import { Injectable, Inject } from '@nestjs/common';
import { EMAIL_TEMPLATE_REPOSITORY } from '../../domain/repositories/email-template.repository';
import type { IEmailTemplateRepository } from '../../domain/repositories/email-template.repository';
import { EmailTemplateAdminNotFoundError } from '../../domain/errors/email-template-admin-not-found.error';

/** Full detail view returned by the admin GET /:name endpoint. */
export interface EmailTemplateDetail {
  name: string;
  subject: string;
  html: string;
  text: string | null;
  description: string | null;
  isActive: boolean;
  updatedAt: Date;
}

/**
 * GetEmailTemplateUseCase — returns the full content of a single template.
 *
 * Unlike findByName used by MailerService, this looks up any template
 * regardless of isActive status so admins can inspect and re-enable
 * inactive templates.
 *
 * Throws EmailTemplateAdminNotFoundError (HTTP 404) when name is unknown.
 *
 * Access: super_admin only (enforced by the controller guard).
 */
@Injectable()
export class GetEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly repo: IEmailTemplateRepository,
  ) {}

  async execute(name: string): Promise<EmailTemplateDetail> {
    const templates = await this.repo.findAll();
    const template = templates.find((t) => t.name === name);

    if (!template) {
      throw new EmailTemplateAdminNotFoundError(name);
    }

    return {
      name: template.name,
      subject: template.subject,
      html: template.html,
      text: template.text,
      description: template.description,
      isActive: template.isActive,
      updatedAt: template.updatedAt,
    };
  }
}
