import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IEmailTemplateRepository,
  EmailTemplateUpdateFields,
} from '../../../domain/repositories/email-template.repository';
import { EmailTemplate } from '../../../domain/entities/email-template.entity';
import { EmailTemplateNotFoundError } from '../../../domain/errors/email-template-not-found.error';
import { EmailTemplateModel } from '../models/email-template.model';

/**
 * Sequelize implementation of IEmailTemplateRepository.
 *
 * Read path: findByName filters by isActive=true (used by MailerService).
 * Admin path: findAll returns all rows; update applies partial edits by name.
 *
 * NOTE: Redis caching is intentionally omitted for simplicity.
 * Templates change very rarely and the table is tiny, so direct DB reads
 * are acceptable. Add a Redis TTL layer (email_template:{name} TTL 300s)
 * if read latency becomes a concern.
 */
@Injectable()
export class SequelizeEmailTemplateRepository implements IEmailTemplateRepository {
  constructor(
    @InjectModel(EmailTemplateModel)
    private readonly model: typeof EmailTemplateModel,
  ) {}

  async findByName(name: string): Promise<EmailTemplate | null> {
    const row = await this.model.findOne({
      where: { name, isActive: true },
    });

    return row ? this.rowToDomain(row) : null;
  }

  async findAll(): Promise<EmailTemplate[]> {
    const rows = await this.model.findAll({
      order: [['name', 'ASC']],
    });

    return rows.map((row) => this.rowToDomain(row));
  }

  async update(name: string, fields: EmailTemplateUpdateFields): Promise<EmailTemplate> {
    const row = await this.model.findOne({ where: { name } });
    if (!row) {
      throw new EmailTemplateNotFoundError(name);
    }

    const updatePayload: Partial<EmailTemplateModel> = {};
    if (fields.subject !== undefined) updatePayload.subject = fields.subject;
    if (fields.html !== undefined) updatePayload.html = fields.html;
    if ('text' in fields) updatePayload.text = fields.text ?? null;
    if (fields.isActive !== undefined) updatePayload.isActive = fields.isActive;

    await row.update(updatePayload);

    return this.rowToDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private rowToDomain(row: EmailTemplateModel): EmailTemplate {
    return EmailTemplate.create({
      id: row.id,
      name: row.name,
      subject: row.subject,
      html: row.html,
      text: row.text,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
