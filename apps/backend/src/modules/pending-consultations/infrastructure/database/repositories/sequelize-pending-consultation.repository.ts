import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import type { Transaction } from 'sequelize';
import { randomUUID } from 'crypto';
import { PendingConsultation } from '../../../domain/entities/pending-consultation.entity';
import type {
  IPendingConsultationRepository,
  PendingConsultationListFilters,
  PendingConsultationBulkCreateItem,
} from '../../../domain/repositories/pending-consultation.repository';
import { PendingConsultationModel } from '../models/pending-consultation.model';
import type { PendingConsultationStatus } from '@delta/shared-types';

@Injectable()
export class SequelizePendingConsultationRepository implements IPendingConsultationRepository {
  constructor(
    @InjectModel(PendingConsultationModel)
    private readonly model: typeof PendingConsultationModel,
  ) {}

  async findById(id: string): Promise<PendingConsultation | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByIdAndDoctor(id: string, doctorId: string): Promise<PendingConsultation | null> {
    const row = await this.model.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByDoctor(filters: PendingConsultationListFilters): Promise<PendingConsultation[]> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };
    if (filters.status) {
      where['status'] = filters.status;
    }

    const rows = await this.model.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findExpired(limit = 500): Promise<PendingConsultation[]> {
    const rows = await this.model.findAll({
      where: {
        status: 'pending_scheduling' as PendingConsultationStatus,
        expiresAt: { [Op.lt]: new Date() },
      } as WhereOptions,
      limit,
      order: [['expiresAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async bulkCreate(
    items: PendingConsultationBulkCreateItem[],
    transaction?: Transaction,
  ): Promise<PendingConsultation[]> {
    const now = new Date();
    const records = items.map((item) => ({
      id: randomUUID(),
      doctorId: item.doctorId,
      patientId: item.patientId,
      authUserId: item.authUserId ?? null,
      packageId: item.packageId ?? null,
      paymentId: item.paymentId ?? null,
      planName: item.planName,
      officeId: item.officeId ?? null,
      appointmentMode: item.appointmentMode ?? null,
      sessionNumber: item.sessionNumber,
      status: 'pending_scheduling' as PendingConsultationStatus,
      expiresAt: item.expiresAt ?? null,
      scheduledAppointmentId: null,
      consultationId: null,
      reminderStage: 0,
      lastReminderAt: null,
      createdAt: now,
      updatedAt: now,
    }));

    const rows = await this.model.bulkCreate(records, { transaction });
    return rows.map((r) => this.toDomain(r));
  }

  async save(entity: PendingConsultation, transaction?: Transaction): Promise<PendingConsultation> {
    const [row] = await this.model.upsert(
      {
        id: entity.id,
        doctorId: entity.doctorId,
        patientId: entity.patientId,
        authUserId: entity.authUserId,
        packageId: entity.packageId,
        paymentId: entity.paymentId,
        planName: entity.planName,
        officeId: entity.officeId,
        appointmentMode: entity.appointmentMode,
        sessionNumber: entity.sessionNumber,
        status: entity.status,
        expiresAt: entity.expiresAt,
        scheduledAppointmentId: entity.scheduledAppointmentId,
        consultationId: entity.consultationId,
        reminderStage: entity.reminderStage,
        lastReminderAt: entity.lastReminderAt,
        updatedAt: entity.updatedAt,
      },
      { transaction, returning: true },
    );
    return this.toDomain(row);
  }

  async bulkExpire(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.model.sequelize?.query(
      `UPDATE pending_consultations
       SET status = 'expired', updated_at = NOW()
       WHERE id = ANY(:ids) AND status = 'pending_scheduling'`,
      {
        replacements: { ids },
        type: QueryTypes.UPDATE,
      },
    );
  }

  async findDueForReminder(limit = 200): Promise<PendingConsultation[]> {
    const rows = await this.model.findAll({
      where: {
        status: 'pending_scheduling' as PendingConsultationStatus,
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
      } as WhereOptions,
      order: [['createdAt', 'ASC']],
      limit,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async updateReminderStage(id: string, stage: number, lastReminderAt: Date): Promise<void> {
    await this.model.update(
      { reminderStage: stage, lastReminderAt, updatedAt: new Date() },
      {
        where: {
          id,
          status: 'pending_scheduling' as PendingConsultationStatus,
        } as WhereOptions,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PendingConsultationModel): PendingConsultation {
    return PendingConsultation.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      authUserId: row.authUserId,
      packageId: row.packageId,
      paymentId: row.paymentId,
      planName: row.planName,
      officeId: row.officeId,
      appointmentMode: row.appointmentMode,
      sessionNumber: Number(row.sessionNumber),
      status: row.status,
      expiresAt: row.expiresAt,
      scheduledAppointmentId: row.scheduledAppointmentId,
      consultationId: row.consultationId,
      reminderStage: Number(row.reminderStage),
      lastReminderAt: row.lastReminderAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
