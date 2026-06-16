import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AiRequestLogModel } from '../models/ai-request-log.model';
import type { IAiRequestLogRepository } from '../../../domain/repositories/ai-request-log.repository';
import type { AiRequestLog } from '../../../domain/entities/ai-request-log.entity';

/**
 * Sequelize implementation of IAiRequestLogRepository.
 *
 * Writes audit entries for AI feature requests.
 * NEVER stores audio, transcript, or any PHI.
 */
@Injectable()
export class SequelizeAiRequestLogRepository implements IAiRequestLogRepository {
  constructor(
    @InjectModel(AiRequestLogModel)
    private readonly model: typeof AiRequestLogModel,
  ) {}

  async save(log: AiRequestLog): Promise<void> {
    await this.model.create({
      id: log.id,
      doctorId: log.doctorId,
      feature: log.feature,
      status: log.status,
      audioBytes: log.audioBytes,
      model: log.model,
      createdAt: log.createdAt,
    });
  }
}
