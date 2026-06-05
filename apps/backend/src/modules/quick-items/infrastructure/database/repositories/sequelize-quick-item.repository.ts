import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { QuickItem, type QuickItemType } from '../../../domain/entities/quick-item.entity';
import { QuickItemNotFoundError } from '../../../domain/errors/quick-item-not-found.error';
import type { IQuickItemRepository } from '../../../domain/repositories/quick-item.repository';
import { QuickItemModel } from '../models/quick-item.model';

/**
 * Sequelize implementation of IQuickItemRepository.
 *
 * Converts between QuickItemModel (infrastructure) and QuickItem (domain).
 */
@Injectable()
export class SequelizeQuickItemRepository implements IQuickItemRepository {
  constructor(
    @InjectModel(QuickItemModel)
    private readonly quickItemModel: typeof QuickItemModel,
  ) {}

  async listByDoctor(doctorId: string, itemType?: QuickItemType): Promise<QuickItem[]> {
    const where: Record<string, unknown> = { doctorId };
    if (itemType !== undefined) {
      where['itemType'] = itemType;
    }

    const rows = await this.quickItemModel.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<QuickItem | null> {
    const row = await this.quickItemModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(item: QuickItem): Promise<QuickItem> {
    const row = await this.quickItemModel.create({
      id: item.id,
      doctorId: item.doctorId,
      itemType: item.itemType,
      name: item.name,
      category: item.category,
      details: item.details,
    });
    return this.toDomain(row);
  }

  async delete(id: string, doctorId: string): Promise<void> {
    const destroyed = await this.quickItemModel.destroy({
      where: { id, doctorId } as WhereOptions,
    });
    if (destroyed === 0) {
      throw new QuickItemNotFoundError();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: QuickItemModel): QuickItem {
    return QuickItem.create({
      id: row.id,
      doctorId: row.doctorId,
      itemType: row.itemType as QuickItemType,
      name: row.name,
      category: row.category ?? null,
      details: row.details ?? null,
      createdAt: row.createdAt,
    });
  }
}
