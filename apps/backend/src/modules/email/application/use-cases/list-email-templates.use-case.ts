import { Injectable, Inject } from '@nestjs/common';
import { EMAIL_TEMPLATE_REPOSITORY } from '../../domain/repositories/email-template.repository';
import type { IEmailTemplateRepository } from '../../domain/repositories/email-template.repository';

/** Summary row returned by the list endpoint (no full html/text). */
export interface EmailTemplateSummary {
  name: string;
  subject: string;
  description: string | null;
  isActive: boolean;
  updatedAt: Date;
}

/**
 * ListEmailTemplatesUseCase — returns all templates as summary rows.
 *
 * Ordered by name ASC. No html/text fields are included to keep the
 * list payload small (those are only needed in the detail view).
 *
 * Access: super_admin only (enforced by the controller guard).
 */
@Injectable()
export class ListEmailTemplatesUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly repo: IEmailTemplateRepository,
  ) {}

  async execute(): Promise<EmailTemplateSummary[]> {
    const templates = await this.repo.findAll();

    return templates.map((t) => ({
      name: t.name,
      subject: t.subject,
      description: t.description,
      isActive: t.isActive,
      updatedAt: t.updatedAt,
    }));
  }
}
