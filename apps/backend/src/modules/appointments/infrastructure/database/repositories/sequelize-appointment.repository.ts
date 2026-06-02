import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import type { AppointmentStatus } from '@delta/shared-types';
import { Appointment } from '../../../domain/entities/appointment.entity';
import type {
  IAppointmentRepository,
  AppointmentListFilters,
  AppointmentListResult,
  SlotConflictParams,
  DuplicateCheckParams,
  PackageInfo,
  AuditLogEntry,
} from '../../../domain/repositories/appointment.repository';
import { AppointmentModel } from '../models/appointment.model';
import { AppointmentChangesLogModel } from '../models/appointment-changes-log.model';

// patient_packages is queried directly via raw SQL to avoid coupling to the
// (not-yet-existing) packages module. No Sequelize model import needed.
import { Sequelize } from 'sequelize-typescript';

const ACTIVE_STATUSES = ['scheduled', 'confirmed', 'pending', 'accepted'];
const DUPLICATE_WINDOW_DEFAULT_MINUTES = 15;

interface PackageRow {
  id: string;
  doctor_id: string;
  used_sessions: string | number;
  total_sessions: string | number;
  status: string;
}

@Injectable()
export class SequelizeAppointmentRepository implements IAppointmentRepository {
  constructor(
    @InjectModel(AppointmentModel)
    private readonly appointmentModel: typeof AppointmentModel,
    @InjectModel(AppointmentChangesLogModel)
    private readonly changesLogModel: typeof AppointmentChangesLogModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string): Promise<Appointment | null> {
    const row = await this.appointmentModel.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async list(filters: AppointmentListFilters): Promise<AppointmentListResult> {
    const where: WhereOptions<AppointmentModel['_attributes']> = {
      doctorId: filters.doctorId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.dateFrom ?? filters.dateTo) {
      where.scheduledAt = {
        ...(filters.dateFrom ? { [Op.gte]: filters.dateFrom } : {}),
        ...(filters.dateTo ? { [Op.lte]: filters.dateTo } : {}),
      };
    }

    const offset = (filters.page - 1) * filters.limit;

    const { count, rows } = await this.appointmentModel.findAndCountAll({
      where,
      limit: filters.limit,
      offset,
      order: [['scheduledAt', 'ASC']],
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async save(appointment: Appointment): Promise<Appointment> {
    const row = await this.appointmentModel.create({
      id: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      authUserId: appointment.authUserId,
      consultationId: appointment.consultationId,
      patientName: appointment.patientName,
      patientPhone: appointment.patientPhone,
      patientEmail: appointment.patientEmail,
      patientCedula: appointment.patientCedula,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      appointmentMode: appointment.appointmentMode,
      source: appointment.source,
      planName: appointment.planName,
      planPrice: appointment.planPrice,
      paymentMethod: appointment.paymentMethod,
      paymentReference: appointment.paymentReference,
      paymentReceiptUrl: appointment.paymentReceiptUrl,
      insuranceName: appointment.insuranceName,
      bcvRate: appointment.bcvRate,
      amountBs: appointment.amountBs,
      packageId: appointment.packageId,
      sessionNumber: appointment.sessionNumber,
      chiefComplaint: appointment.chiefComplaint,
      appointmentCode: appointment.appointmentCode,
    });
    return this.toDomain(row);
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    await this.appointmentModel.update({ status }, { where: { id } });
    const updated = await this.appointmentModel.findByPk(id);
    // findByPk after successful update should never be null
    return this.toDomain(updated as AppointmentModel);
  }

  async hasSlotConflict(params: SlotConflictParams): Promise<boolean> {
    const where: WhereOptions<AppointmentModel['_attributes']> = {
      doctorId: params.doctorId,
      scheduledAt: params.scheduledAt,
      status: { [Op.in]: ACTIVE_STATUSES },
    };

    if (params.excludeId) {
      where.id = { [Op.ne]: params.excludeId };
    }

    const count = await this.appointmentModel.count({ where });
    return count > 0;
  }

  async hasDuplicate(params: DuplicateCheckParams): Promise<boolean> {
    const windowMs = (params.windowMinutes ?? DUPLICATE_WINDOW_DEFAULT_MINUTES) * 60 * 1000;
    const from = new Date(params.scheduledAt.getTime() - windowMs);
    const to = new Date(params.scheduledAt.getTime() + windowMs);

    const count = await this.appointmentModel.count({
      where: {
        patientId: params.patientId,
        scheduledAt: { [Op.between]: [from, to] },
        status: { [Op.in]: ACTIVE_STATUSES },
      },
    });

    return count > 0;
  }

  async findPackageById(packageId: string): Promise<PackageInfo | null> {
    // QueryTypes.SELECT returns the rows directly as an array (no [rows, meta] tuple).
    const rows = await this.sequelize.query<PackageRow>(
      `SELECT id, doctor_id, used_sessions, total_sessions, status
       FROM patient_packages
       WHERE id = :packageId
       LIMIT 1`,
      { replacements: { packageId }, type: QueryTypes.SELECT },
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      doctorId: row.doctor_id,
      usedSessions: Number(row.used_sessions),
      totalSessions: Number(row.total_sessions),
      status: row.status,
    };
  }

  async incrementPackageSessions(packageId: string, currentUsedSessions: number): Promise<boolean> {
    // QueryTypes.RAW returns [unknown[], number] where the second element is rowsAffected.
    const [, affected] = await this.sequelize.query(
      `UPDATE patient_packages
       SET used_sessions = used_sessions + 1,
           updated_at    = now()
       WHERE id             = :packageId
         AND used_sessions  = :currentUsedSessions`,
      {
        replacements: { packageId, currentUsedSessions },
        type: QueryTypes.RAW,
      },
    );

    return affected === 1;
  }

  async logStatusChange(entry: AuditLogEntry): Promise<void> {
    await this.changesLogModel.create({
      appointmentId: entry.appointmentId,
      actorId: entry.actorId,
      oldStatus: entry.oldStatus ?? null,
      newStatus: entry.newStatus,
    });
  }

  private toDomain(row: AppointmentModel): Appointment {
    return Appointment.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      authUserId: row.authUserId,
      consultationId: row.consultationId,
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      patientEmail: row.patientEmail,
      patientCedula: row.patientCedula,
      scheduledAt: row.scheduledAt,
      status: row.status,
      appointmentMode: row.appointmentMode,
      source: row.source,
      planName: row.planName,
      planPrice: row.planPrice !== null ? Number(row.planPrice) : null,
      paymentMethod: row.paymentMethod,
      paymentReference: row.paymentReference,
      paymentReceiptUrl: row.paymentReceiptUrl,
      insuranceName: row.insuranceName,
      bcvRate: row.bcvRate !== null ? Number(row.bcvRate) : null,
      amountBs: row.amountBs !== null ? Number(row.amountBs) : null,
      packageId: row.packageId,
      sessionNumber: row.sessionNumber,
      chiefComplaint: row.chiefComplaint,
      appointmentCode: row.appointmentCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
