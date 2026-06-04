import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { Lead, type LeadStage } from '../../../domain/entities/lead.entity';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';
import type {
  ILeadRepository,
  LeadListFilters,
} from '../../../domain/repositories/lead.repository';
import { LeadModel } from '../models/lead.model';

/**
 * Sequelize implementation of ILeadRepository.
 *
 * No encryption — leads are prospect data, not PHI. The `phone` field is NOT
 * logged anywhere in this file (see security rules).
 */
@Injectable()
export class SequelizeLeadRepository implements ILeadRepository {
  constructor(
    @InjectModel(LeadModel)
    private readonly leadModel: typeof LeadModel,
  ) {}

  async list(filters: LeadListFilters): Promise<Lead[]> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };
    if (filters.stage) {
      where.stage = filters.stage;
    }

    const rows = await this.leadModel.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    return rows.map((r) => this.toDomain(r));
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Lead | null> {
    const row = await this.leadModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(lead: Lead): Promise<Lead> {
    const row = await this.leadModel.create({
      id: lead.id,
      doctorId: lead.doctorId,
      name: lead.name,
      phone: lead.phone,
      channel: lead.channel,
      stage: lead.stage,
      message: lead.message,
      source: lead.source,
      status: lead.status,
      lastActivity: lead.lastActivity,
    });

    return this.toDomain(row);
  }

  async save(
    id: string,
    doctorId: string,
    fields: {
      name?: string;
      phone?: string | null;
      channel?: string | null;
      message?: string | null;
      stage?: LeadStage;
      lastActivity?: Date | null;
    },
  ): Promise<Lead> {
    const updateData: Record<string, unknown> = {};

    if (fields.name !== undefined) updateData.name = fields.name;
    if (fields.phone !== undefined) updateData.phone = fields.phone;
    if (fields.channel !== undefined) updateData.channel = fields.channel;
    if (fields.message !== undefined) updateData.message = fields.message;
    if (fields.stage !== undefined) updateData.stage = fields.stage;
    if (fields.lastActivity !== undefined) updateData.lastActivity = fields.lastActivity;

    await this.leadModel.update(updateData, {
      where: { id, doctorId } as WhereOptions,
    });

    const updated = await this.leadModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!updated) {
      throw new LeadNotFoundError();
    }

    return this.toDomain(updated);
  }

  async delete(id: string, doctorId: string): Promise<void> {
    const destroyed = await this.leadModel.destroy({
      where: { id, doctorId } as WhereOptions,
    });
    if (destroyed === 0) {
      throw new LeadNotFoundError();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: LeadModel): Lead {
    return Lead.create({
      id: row.id,
      doctorId: row.doctorId,
      name: row.name,
      phone: row.phone,
      channel: row.channel,
      stage: (row.stage ?? 'new') as LeadStage,
      message: row.message,
      source: row.source,
      status: row.status,
      lastActivity: row.lastActivity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
