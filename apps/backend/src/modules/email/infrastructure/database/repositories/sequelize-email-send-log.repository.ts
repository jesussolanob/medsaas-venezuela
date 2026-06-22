import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { IEmailSendLogRepository } from '../../../domain/repositories/email-send-log.repository';
import type { EmailSendLog } from '../../../domain/entities/email-send-log.entity';
import { EmailSendLogModel } from '../models/email-send-log.model';

/**
 * SequelizeEmailSendLogRepository — concrete Sequelize implementation of
 * IEmailSendLogRepository.
 *
 * Write-only: inserts are the only operation exposed.
 *
 * SECURITY: The domain entity NEVER contains email addresses — this class
 * maps the entity's recipient reference (type + id) to the model columns.
 */
@Injectable()
export class SequelizeEmailSendLogRepository implements IEmailSendLogRepository {
  constructor(
    @InjectModel(EmailSendLogModel)
    private readonly model: typeof EmailSendLogModel,
  ) {}

  async record(entry: EmailSendLog): Promise<void> {
    await this.model.create({
      id: entry.id,
      recipientType: entry.recipientType,
      recipientId: entry.recipientId ?? null,
      templateName: entry.templateName,
      status: entry.status,
      provider: entry.provider,
      providerMessageId: entry.providerMessageId ?? null,
      errorDetail: entry.errorDetail ?? null,
      createdAt: entry.createdAt,
    });
  }
}
