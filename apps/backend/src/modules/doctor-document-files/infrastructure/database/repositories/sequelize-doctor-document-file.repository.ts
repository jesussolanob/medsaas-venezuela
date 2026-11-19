import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { DoctorDocumentFile } from '../../../domain/entities/doctor-document-file.entity';
import type { IDoctorDocumentFileRepository } from '../../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFileModel } from '../models/doctor-document-file.model';

/**
 * Sequelize implementation of IDoctorDocumentFileRepository.
 *
 * All queries scope to doctor_id for anti-IDOR. Soft-deleted rows are
 * excluded automatically via Sequelize paranoid mode except where explicit
 * raw SQL is used (rename / softDelete).
 *
 * Uses IN (:ids) — never = ANY(:ids) — for Sequelize mock compatibility.
 */
@Injectable()
export class SequelizeDoctorDocumentFileRepository implements IDoctorDocumentFileRepository {
  constructor(
    @InjectModel(DoctorDocumentFileModel)
    private readonly model: typeof DoctorDocumentFileModel,
  ) {}

  async findAllByDoctor(doctorId: string): Promise<DoctorDocumentFile[]> {
    const rows = await this.model.findAll({
      where: { doctorId } as WhereOptions,
      order: [['created_at', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string, doctorId: string): Promise<DoctorDocumentFile | null> {
    const row = await this.model.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    return row ? this.toDomain(row) : null;
  }

  async findByIdsAndDoctor(ids: string[], doctorId: string): Promise<DoctorDocumentFile[]> {
    if (ids.length === 0) return [];

    // Uses IN (:ids) via Sequelize Op.in — never = ANY(:ids)
    const rows = await this.model.findAll({
      where: {
        id: { [Op.in]: ids },
        doctorId,
      } as WhereOptions,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async countActiveByDoctor(doctorId: string): Promise<number> {
    return this.model.count({
      where: { doctorId } as WhereOptions,
    });
  }

  async save(file: DoctorDocumentFile): Promise<DoctorDocumentFile> {
    const row = await this.model.create({
      id: file.id,
      doctorId: file.doctorId,
      name: file.name,
      storagePath: file.storagePath,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
    return this.toDomain(row);
  }

  async rename(id: string, doctorId: string, name: string): Promise<void> {
    await this.model.update({ name } as object, {
      where: { id, doctorId } as WhereOptions,
    });
  }

  async softDelete(id: string, doctorId: string): Promise<void> {
    // Sequelize paranoid destroy sets deleted_at automatically
    await this.model.destroy({
      where: { id, doctorId } as WhereOptions,
    });
  }

  private toDomain(row: DoctorDocumentFileModel): DoctorDocumentFile {
    return DoctorDocumentFile.create({
      id: row.id,
      doctorId: row.doctorId,
      name: row.name,
      storagePath: row.storagePath,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    });
  }
}
