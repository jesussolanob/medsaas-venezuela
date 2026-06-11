import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Specialty } from '../../../domain/entities/specialty.entity';
import type {
  ISpecialtyRepository,
  CreateSpecialtyParams,
  UpdateSpecialtyParams,
} from '../../../domain/repositories/specialty.repository';
import { SpecialtyNotFoundError } from '../../../domain/errors/specialty-not-found.error';
import { SpecialtyModel } from '../models/specialty.model';

@Injectable()
export class SequelizeSpecialtyRepository implements ISpecialtyRepository {
  constructor(
    @InjectModel(SpecialtyModel)
    private readonly model: typeof SpecialtyModel,
  ) {}

  async findAllActive(): Promise<Specialty[]> {
    const rows = await this.model.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<Specialty | null> {
    const row = await this.model.findByPk(id);
    return row ? this.toDomain(row) : null;
  }

  async findByName(name: string): Promise<Specialty | null> {
    const row = await this.model.findOne({ where: { name } });
    return row ? this.toDomain(row) : null;
  }

  async create(params: CreateSpecialtyParams): Promise<Specialty> {
    const row = await this.model.create({
      name: params.name,
      sortOrder: params.sortOrder,
      isActive: true,
    });
    return this.toDomain(row);
  }

  async update(id: string, params: UpdateSpecialtyParams): Promise<Specialty> {
    const row = await this.model.findByPk(id);
    if (!row) throw new SpecialtyNotFoundError(id);

    const changes: Record<string, unknown> = {};
    if (params.name !== undefined) changes['name'] = params.name;
    if (params.isActive !== undefined) changes['isActive'] = params.isActive;
    if (params.sortOrder !== undefined) changes['sortOrder'] = params.sortOrder;

    await row.update(changes);
    return this.toDomain(row);
  }

  private toDomain(row: SpecialtyModel): Specialty {
    return Specialty.reconstitute({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
