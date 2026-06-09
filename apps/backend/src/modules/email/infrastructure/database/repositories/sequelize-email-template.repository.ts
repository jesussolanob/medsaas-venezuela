import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { IEmailTemplateRepository } from '../../../domain/repositories/email-template.repository';
import { EmailTemplate } from '../../../domain/entities/email-template.entity';
import { EmailTemplateModel } from '../models/email-template.model';

/**
 * Sequelize implementation of IEmailTemplateRepository.
 *
 * Read-only: templates are managed directly via DB migrations/seeds.
 * Only active templates (is_active = true) are returned.
 *
 * NOTE: Redis caching is intentionally omitted for simplicity.
 * Templates change very rarely (only on manual DB updates) and the table
 * is tiny, so direct DB reads are acceptable. Add a Redis TTL layer
 * (email_template:{name} TTL 300s) if read latency becomes a concern.
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
