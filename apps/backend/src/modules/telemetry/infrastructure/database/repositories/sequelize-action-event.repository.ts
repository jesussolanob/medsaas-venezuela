import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ActionEventModel } from '../models/action-event.model';
import {
  type IActionEventRepository,
  type ActionEventQueryFilters,
  type ActionEventListResult,
} from '../../../domain/repositories/action-event.repository';
import { ActionEvent } from '../../../domain/entities/action-event.entity';

/**
 * Sequelize implementation of IActionEventRepository.
 *
 * Uses bulkCreate for batch inserts (single round-trip).
 * SECURITY: never logs metadata values — only structural info.
 */
@Injectable()
export class SequelizeActionEventRepository implements IActionEventRepository {
  constructor(
    @InjectModel(ActionEventModel)
    private readonly model: typeof ActionEventModel,
  ) {}

  async bulkInsert(events: ActionEvent[]): Promise<ActionEvent[]> {
    const rows = events.map((e) => ({
      id: e.id,
      doctorId: e.doctorId,
      sessionId: e.sessionId,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      metadata: e.metadata,
      occurredAt: e.occurredAt,
      createdAt: e.createdAt,
    }));

    await this.model.bulkCreate(rows, { validate: false });
    return events;
  }

  async findByDoctor(filters: ActionEventQueryFilters): Promise<ActionEventListResult> {
    const occurredAtFilter: Record<symbol, Date> = {};
    if (filters.from !== undefined) occurredAtFilter[Op.gte] = filters.from;
    if (filters.to !== undefined) occurredAtFilter[Op.lte] = filters.to;

    const where: Record<string, unknown> = { doctorId: filters.doctorId };
    if (Object.getOwnPropertySymbols(occurredAtFilter).length > 0) {
      where['occurredAt'] = occurredAtFilter;
    }

    const { rows, count } = await this.model.findAndCountAll({
      where,
      limit: filters.limit,
      offset: filters.offset,
      order: [['occurredAt', 'DESC']],
    });

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: count,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  private toDomain(row: ActionEventModel): ActionEvent {
    return new ActionEvent(
      row.id,
      row.doctorId,
      row.sessionId,
      row.action,
      row.resourceType,
      row.resourceId,
      row.metadata,
      row.occurredAt,
      row.createdAt,
    );
  }
}
