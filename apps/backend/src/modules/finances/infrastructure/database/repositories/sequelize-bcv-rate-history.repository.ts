import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IBcvRateHistoryRepository,
  BcvRateHistoryEntry,
} from '../../../domain/repositories/bcv-rate-history.repository';
import { BcvRateHistoryModel } from '../models/bcv-rate-history.model';

/**
 * Sequelize implementation of IBcvRateHistoryRepository.
 *
 * Upsert behaviour: findOrCreate avoids duplicates for the same rate_date
 * without needing a separate conflict clause (DATE PRIMARY KEY handles uniqueness).
 */
@Injectable()
export class SequelizeBcvRateHistoryRepository implements IBcvRateHistoryRepository {
  constructor(
    @InjectModel(BcvRateHistoryModel)
    private readonly model: typeof BcvRateHistoryModel,
  ) {}

  async findByDate(date: string): Promise<BcvRateHistoryEntry | null> {
    const row = await this.model.findOne({
      where: { rateDate: date } as Record<string, unknown>,
    });
    if (!row) return null;
    return {
      rateDate: row.rateDate,
      rate: Number(row.rate),
      source: row.source,
    };
  }

  async save(entry: BcvRateHistoryEntry): Promise<void> {
    // findOrCreate: first time sets the row; subsequent calls are no-ops.
    await this.model.findOrCreate({
      where: { rateDate: entry.rateDate } as Record<string, unknown>,
      defaults: {
        rateDate: entry.rateDate,
        rate: entry.rate,
        source: entry.source,
        createdAt: new Date(),
      } as Partial<BcvRateHistoryModel>,
    });
  }
}
