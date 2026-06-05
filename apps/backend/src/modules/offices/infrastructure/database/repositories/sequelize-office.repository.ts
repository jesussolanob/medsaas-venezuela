import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { Office } from '../../../domain/entities/office.entity';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { OfficeModel } from '../models/office.model';

/**
 * Sequelize implementation of IOfficeRepository.
 *
 * Converts between OfficeModel (infrastructure) and Office (domain).
 * The `schedule` field is stored as JSONB and passed through without transformation.
 */
@Injectable()
export class SequelizeOfficeRepository implements IOfficeRepository {
  constructor(
    @InjectModel(OfficeModel)
    private readonly officeModel: typeof OfficeModel,
  ) {}

  async listByDoctor(doctorId: string): Promise<Office[]> {
    const rows = await this.officeModel.findAll({
      where: { doctorId } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Office | null> {
    const row = await this.officeModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findActiveByDoctor(doctorId: string): Promise<Office[]> {
    const rows = await this.officeModel.findAll({
      where: { doctorId, isActive: true } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async create(office: Office): Promise<Office> {
    const row = await this.officeModel.create({
      id: office.id,
      doctorId: office.doctorId,
      name: office.name,
      address: office.address,
      city: office.city,
      phone: office.phone,
      schedule: office.schedule,
      slotDuration: office.slotDuration,
      bufferMinutes: office.bufferMinutes,
      isActive: office.isActive,
    });
    return this.toDomain(row);
  }

  async save(office: Office): Promise<Office> {
    await this.officeModel.update(
      {
        name: office.name,
        address: office.address,
        city: office.city,
        phone: office.phone,
        schedule: office.schedule,
        slotDuration: office.slotDuration,
        bufferMinutes: office.bufferMinutes,
        isActive: office.isActive,
      },
      {
        where: { id: office.id, doctorId: office.doctorId } as WhereOptions,
      },
    );

    const updated = await this.officeModel.findOne({
      where: { id: office.id, doctorId: office.doctorId } as WhereOptions,
    });
    if (!updated) {
      throw new OfficeNotFoundError();
    }
    return this.toDomain(updated);
  }

  async delete(id: string, doctorId: string): Promise<void> {
    const destroyed = await this.officeModel.destroy({
      where: { id, doctorId } as WhereOptions,
    });
    if (destroyed === 0) {
      throw new OfficeNotFoundError();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: OfficeModel): Office {
    return Office.create({
      id: row.id,
      doctorId: row.doctorId,
      name: row.name,
      address: row.address ?? '',
      city: row.city ?? '',
      phone: row.phone ?? '',
      schedule: Array.isArray(row.schedule) ? row.schedule : [],
      slotDuration: row.slotDuration,
      bufferMinutes: row.bufferMinutes,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
