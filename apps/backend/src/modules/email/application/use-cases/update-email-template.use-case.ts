import { Injectable, Inject } from '@nestjs/common';
import { EMAIL_TEMPLATE_REPOSITORY } from '../../domain/repositories/email-template.repository';
import type { IEmailTemplateRepository } from '../../domain/repositories/email-template.repository';
import { EmailTemplateAdminNotFoundError } from '../../domain/errors/email-template-admin-not-found.error';
import type { EmailTemplateDetail } from './get-email-template.use-case';

/** Input accepted by the admin PUT /:name endpoint. All fields are optional. */
export interface UpdateEmailTemplateInput {
  subject?: string;
  html?: string;
  text?: string | null;
  isActive?: boolean;
}

/**
 * UpdateEmailTemplateUseCase — applies a partial update to an existing template.
 *
 * Only fields that are explicitly provided in the input are changed.
 * The template name is immutable — creating or deleting templates is not
 * supported; the set is fixed by the application code that sends them.
 *
 * Throws EmailTemplateAdminNotFoundError (HTTP 404) when name is unknown.
 *
 * Access: super_admin only (enforced by the controller guard).
 */
@Injectable()
export class UpdateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly repo: IEmailTemplateRepository,
  ) {}

  async execute(name: string, input: UpdateEmailTemplateInput): Promise<EmailTemplateDetail> {
    // Verify existence before delegating to the repo so we get a clean 404
    // even if the repo's update method raises a different error variant.
    const allTemplates = await this.repo.findAll();
    const exists = allTemplates.some((t) => t.name === name);
    if (!exists) {
      throw new EmailTemplateAdminNotFoundError(name);
    }

    const updated = await this.repo.update(name, {
      subject: input.subject,
      html: input.html,
      ...(input.text !== undefined ? { text: input.text } : {}),
      isActive: input.isActive,
    });

    return {
      name: updated.name,
      subject: updated.subject,
      html: updated.html,
      text: updated.text,
      description: updated.description,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    };
  }
}
