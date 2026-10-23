import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import {
  ContentTemplate,
  type ContentTemplateType,
} from '../../../domain/entities/content-template.entity';
import { ContentTemplateNotFoundError } from '../../../domain/errors/content-template-not-found.error';
import type {
  IContentTemplateRepository,
  ListContentTemplatesFilters,
  CreateContentTemplateParams,
  UpdateContentTemplateParams,
} from '../../../domain/repositories/icontent-template.repository';
import { ContentTemplateModel } from '../models/content-template.model';

@Injectable()
export class SequelizeContentTemplateRepository implements IContentTemplateRepository {
  constructor(
    @InjectModel(ContentTemplateModel)
    private readonly model: typeof ContentTemplateModel,
  ) {}

  async list(filters: ListContentTemplatesFilters): Promise<ContentTemplate[]> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };
    if (filters.type) {
      where['type'] = filters.type;
    }
    const rows = await this.model.findAll({
      where,
      order: [['name', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<ContentTemplate | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(params: CreateContentTemplateParams): Promise<ContentTemplate> {
    const row = await this.model.create({
      id: randomUUID(),
      doctorId: params.doctorId,
      type: params.type,
      name: params.name,
      content: params.content,
    });
    return this.toDomain(row);
  }

  async update(id: string, params: UpdateContentTemplateParams): Promise<ContentTemplate> {
    const row = await this.model.findByPk(id);
    if (!row) {
      throw new ContentTemplateNotFoundError();
    }
    if (params.name !== undefined) row.name = params.name;
    if (params.content !== undefined) row.content = params.content;
    await row.save();
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.model.destroy({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Private mapper
  // ---------------------------------------------------------------------------

  private toDomain(row: ContentTemplateModel): ContentTemplate {
    return ContentTemplate.create({
      id: row.id,
      doctorId: row.doctorId,
      type: row.type as ContentTemplateType,
      name: row.name,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
