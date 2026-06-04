import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type WhereOptions } from 'sequelize';
import { Promotion } from '../../../domain/entities/promotion.entity';
import { PromotionNotFoundError } from '../../../domain/errors/promotion-not-found.error';
import type {
  IPromotionRepository,
  PromotionCreateParams,
  PromotionUpdateParams,
} from '../../../domain/repositories/promotion.repository';
import { PlanPromotionModel } from '../models/plan-promotion.model';

/**
 * Sequelize implementation of IPromotionRepository.
 *
 * DECIMAL columns (original_price_usd, promo_price_usd) come back as strings from
 * Postgres via pg driver — always convert with Number() in toDomain().
 */
@Injectable()
export class SequelizePromotionRepository implements IPromotionRepository {
  constructor(
    @InjectModel(PlanPromotionModel)
    private readonly model: typeof PlanPromotionModel,
  ) {}

  async listAll(): Promise<Promotion[]> {
    const rows = await this.model.findAll({
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async listActive(): Promise<Promotion[]> {
    const now = new Date();
    const rows = await this.model.findAll({
      where: {
        isActive: true,
        [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: now } }],
      } as WhereOptions,
      order: [['planKey', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<Promotion | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(params: PromotionCreateParams): Promise<Promotion> {
    const row = await this.model.create({
      planKey: params.planKey,
      durationMonths: params.durationMonths,
      originalPriceUsd: params.originalPriceUsd,
      promoPriceUsd: params.promoPriceUsd,
      label: params.label,
      isActive: params.isActive,
      endsAt: params.endsAt,
    });
    return this.toDomain(row);
  }

  async update(id: string, fields: PromotionUpdateParams): Promise<Promotion> {
    const updateData: Record<string, unknown> = {};

    if (fields.planKey !== undefined) updateData.planKey = fields.planKey;
    if (fields.durationMonths !== undefined) updateData.durationMonths = fields.durationMonths;
    if (fields.originalPriceUsd !== undefined)
      updateData.originalPriceUsd = fields.originalPriceUsd;
    if (fields.promoPriceUsd !== undefined) updateData.promoPriceUsd = fields.promoPriceUsd;
    if (fields.label !== undefined) updateData.label = fields.label;
    if (fields.isActive !== undefined) updateData.isActive = fields.isActive;
    if (fields.endsAt !== undefined) updateData.endsAt = fields.endsAt;

    await this.model.update(updateData, { where: { id } as WhereOptions });

    const updated = await this.model.findByPk(id);
    if (!updated) {
      throw new PromotionNotFoundError();
    }

    return this.toDomain(updated);
  }

  async delete(id: string): Promise<void> {
    const destroyed = await this.model.destroy({ where: { id } as WhereOptions });
    if (destroyed === 0) {
      throw new PromotionNotFoundError();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PlanPromotionModel): Promotion {
    return new Promotion({
      id: row.id,
      planKey: row.planKey,
      durationMonths: row.durationMonths,
      // DECIMAL columns come back as strings from pg driver — convert to number.
      originalPriceUsd: Number(row.originalPriceUsd),
      promoPriceUsd: Number(row.promoPriceUsd),
      label: row.label,
      isActive: row.isActive,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
