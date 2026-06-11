import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { AvailabilityBlock } from '../../../domain/entities/availability-block.entity';
import type {
  IAvailabilityBlockRepository,
  ListBlocksFilter,
} from '../../../domain/repositories/availability-block.repository';
import { AvailabilityBlockModel } from '../models/availability-block.model';

@Injectable()
export class SequelizeAvailabilityBlockRepository implements IAvailabilityBlockRepository {
  constructor(
    @InjectModel(AvailabilityBlockModel)
    private readonly model: typeof AvailabilityBlockModel,
  ) {}

  async findByDoctor(doctorId: string, filter?: ListBlocksFilter): Promise<AvailabilityBlock[]> {
    const where: Record<string, unknown> = { doctorId };

    if (filter?.from || filter?.to) {
      const rangeConditions: Record<string, unknown> = {};
      if (filter.from) {
        rangeConditions[Op.gte as unknown as string] = filter.from;
      }
      if (filter.to) {
        rangeConditions[Op.lte as unknown as string] = filter.to;
      }
      where['startsAt'] = rangeConditions;
    }

    const rows = await this.model.findAll({
      where,
      order: [['starts_at', 'ASC']],
    });

    return rows.map((r) => this.toDomain(r));
  }

  async findOverlapping(
    doctorId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<AvailabilityBlock[]> {
    const rows = await this.model.findAll({
      where: {
        doctorId,
        startsAt: { [Op.lt]: rangeEnd },
        endsAt: { [Op.gt]: rangeStart },
      },
      order: [['starts_at', 'ASC']],
    });

    return rows.map((r) => this.toDomain(r));
  }

  async create(block: AvailabilityBlock): Promise<AvailabilityBlock> {
    const row = await this.model.create({
      id: block.id,
      doctorId: block.doctorId,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<AvailabilityBlock | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.model.destroy({ where: { id } });
  }

  private toDomain(row: AvailabilityBlockModel): AvailabilityBlock {
    return AvailabilityBlock.create({
      id: row.id,
      doctorId: row.doctorId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
