import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { PatientRequestAttachment } from '../../../domain/entities/patient-request-attachment.entity';
import type { IPatientRequestAttachmentRepository } from '../../../domain/repositories/patient-request-attachment.repository';
import { PatientRequestAttachmentModel } from '../models/patient-request-attachment.model';

/**
 * Sequelize implementation of IPatientRequestAttachmentRepository.
 *
 * Stores storage paths (not signed URLs) — signed URLs are generated on demand.
 */
@Injectable()
export class SequelizePatientRequestAttachmentRepository implements IPatientRequestAttachmentRepository {
  constructor(
    @InjectModel(PatientRequestAttachmentModel)
    private readonly model: typeof PatientRequestAttachmentModel,
  ) {}

  async save(attachment: PatientRequestAttachment): Promise<PatientRequestAttachment> {
    const row = await this.model.create({
      id: attachment.id,
      requestId: attachment.requestId,
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      uploadedAt: attachment.uploadedAt,
    });
    return this.toDomain(row);
  }

  async findByRequestId(requestId: string): Promise<PatientRequestAttachment[]> {
    const rows = await this.model.findAll({
      where: { requestId } as WhereOptions,
      order: [['uploaded_at', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async countByRequestId(requestId: string): Promise<number> {
    return this.model.count({ where: { requestId } as WhereOptions });
  }

  async countByRequestIds(requestIds: string[]): Promise<Record<string, number>> {
    if (requestIds.length === 0) return {};

    const rows = (await this.model.findAll({
      attributes: ['requestId', [fn('COUNT', col('id')), 'count']],
      where: { requestId: { [Op.in]: requestIds } } as WhereOptions,
      group: ['requestId'],
      raw: true,
    })) as unknown as Array<{ requestId: string; count: string }>;

    // Seed every requested ID with 0, then overwrite with actual counts
    const result: Record<string, number> = Object.fromEntries(requestIds.map((id) => [id, 0]));
    for (const row of rows) {
      result[row.requestId] = parseInt(row.count, 10);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PatientRequestAttachmentModel): PatientRequestAttachment {
    return PatientRequestAttachment.create({
      id: row.id,
      requestId: row.requestId,
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      contentType: row.contentType ?? null,
      sizeBytes: row.sizeBytes ?? null,
      uploadedAt: row.uploadedAt,
    });
  }
}
