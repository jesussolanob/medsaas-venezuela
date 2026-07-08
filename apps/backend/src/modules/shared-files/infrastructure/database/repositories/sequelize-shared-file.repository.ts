import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SharedFileModel } from '../models/shared-file.model';
import {
  SharedFile,
  type SharedFileCategory,
  type SharedFileStatus,
  type SharedFileCreatedBy,
} from '../../../domain/entities/shared-file.entity';
import type {
  ISharedFileRepository,
  UnreadCountsResult,
} from '../../../domain/repositories/shared-file.repository';
import {
  STORAGE_PORT,
  type IStoragePort,
} from '../../../../storage/application/ports/storage.port';

/**
 * Sequelize implementation of ISharedFileRepository.
 *
 * SIGNED URL POLICY:
 *   The `file_url` column stores the GCS object PATH, not a signed URL.
 *   Every method that returns SharedFile entities calls `resolveSignedUrl()`
 *   to replace the path with a fresh signed URL (1h TTL) before returning.
 *
 *   This approach mirrors the same pattern used in document-sharing.
 *   If no storage adapter is configured or the path is null, the raw path
 *   (or null) is returned as-is — the frontend handles null file_url gracefully.
 */
@Injectable()
export class SequelizeSharedFileRepository implements ISharedFileRepository {
  constructor(
    @InjectModel(SharedFileModel)
    private readonly model: typeof SharedFileModel,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
    private readonly sequelize: Sequelize,
  ) {}

  async save(sf: SharedFile): Promise<SharedFile> {
    const row = await this.model.create({
      id: sf.id,
      doctorId: sf.doctorId,
      patientId: sf.patientId,
      title: sf.title,
      description: sf.description,
      filePath: sf.filePath,
      fileType: sf.fileType,
      fileSizeBytes: sf.fileSizeBytes,
      category: sf.category,
      status: sf.status,
      createdBy: sf.createdBy,
      parentTaskId: sf.parentTaskId,
      readByDoctor: sf.readByDoctor,
      readByPatient: sf.readByPatient,
    });
    return this.toDomain(row);
  }

  async findByIdAndDoctor(id: string, doctorId: string): Promise<SharedFile | null> {
    const row = await this.model.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByIdAndPatient(id: string, patientId: string): Promise<SharedFile | null> {
    const row = await this.model.findOne({
      where: { id, patientId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async listByDoctorAndPatient(doctorId: string, patientId: string): Promise<SharedFile[]> {
    const rows = await this.model.findAll({
      where: { doctorId, patientId } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return Promise.all(rows.map((r) => this.toDomain(r)));
  }

  async listByPatient(patientId: string): Promise<SharedFile[]> {
    const rows = await this.model.findAll({
      where: { patientId } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return Promise.all(rows.map((r) => this.toDomain(r)));
  }

  async update(
    id: string,
    fields: {
      title?: string;
      description?: string | null;
      status?: string;
      readByDoctor?: boolean;
      readByPatient?: boolean;
    },
  ): Promise<SharedFile | null> {
    // Build update payload — only defined keys are applied.
    const payload: Partial<{
      title: string;
      description: string | null;
      status: string;
      readByDoctor: boolean;
      readByPatient: boolean;
    }> = {};
    if (fields.title !== undefined) payload.title = fields.title;
    if (fields.description !== undefined) payload.description = fields.description;
    if (fields.status !== undefined) payload.status = fields.status;
    if (fields.readByDoctor !== undefined) payload.readByDoctor = fields.readByDoctor;
    if (fields.readByPatient !== undefined) payload.readByPatient = fields.readByPatient;

    await this.model.update(payload, { where: { id } as WhereOptions });

    const updated = await this.model.findByPk(id);
    if (!updated) return null;
    return this.toDomain(updated);
  }

  async delete(id: string): Promise<void> {
    await this.model.destroy({ where: { id } as WhereOptions });
  }

  async markReadByDoctor(doctorId: string, patientId: string): Promise<void> {
    await this.model.update(
      { readByDoctor: true },
      {
        where: {
          doctorId,
          patientId,
          createdBy: 'patient',
          readByDoctor: false,
        } as WhereOptions,
      },
    );
  }

  async markReadByPatient(patientId: string): Promise<void> {
    await this.model.update(
      { readByPatient: true },
      {
        where: {
          patientId,
          createdBy: 'doctor',
          readByPatient: false,
        } as WhereOptions,
      },
    );
  }

  async getUnreadCountsByDoctor(doctorId: string): Promise<UnreadCountsResult> {
    const rows = await this.sequelize.query<{ patient_id: string; count: string }>(
      `SELECT patient_id, COUNT(*) AS count
       FROM shared_files
       WHERE doctor_id = :doctorId
         AND created_by = 'patient'
         AND read_by_doctor = false
       GROUP BY patient_id`,
      { replacements: { doctorId }, type: QueryTypes.SELECT },
    );

    const result: UnreadCountsResult = {};
    for (const row of rows) {
      result[row.patient_id] = parseInt(row.count, 10);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a Sequelize model row to a domain entity, resolving a fresh
   * signed URL for the stored GCS object path when present.
   *
   * If the storage adapter throws (e.g. object was deleted from GCS), we fall
   * back to returning the raw path so the UI can show a broken-link indicator
   * rather than crashing the entire list endpoint.
   */
  private async toDomain(row: SharedFileModel): Promise<SharedFile> {
    let resolvedFilePath: string | null = row.filePath;

    if (row.filePath) {
      try {
        resolvedFilePath = await this.storage.getSignedUrl(row.filePath);
      } catch {
        // Fallback: return raw path — frontend handles null/broken URL gracefully.
        resolvedFilePath = row.filePath;
      }
    }

    return SharedFile.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      title: row.title,
      description: row.description,
      filePath: resolvedFilePath,
      fileType: row.fileType,
      fileSizeBytes: row.fileSizeBytes,
      category: row.category as SharedFileCategory,
      status: row.status as SharedFileStatus,
      createdBy: row.createdBy as SharedFileCreatedBy,
      parentTaskId: row.parentTaskId,
      readByDoctor: row.readByDoctor,
      readByPatient: row.readByPatient,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
