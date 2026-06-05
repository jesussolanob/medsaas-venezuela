import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ReminderQueueItem } from '../../../domain/entities/reminder-queue-item.entity';
import type { ReminderQueueStatus } from '../../../domain/entities/reminder-queue-item.entity';
import type { IRemindersQueueRepository } from '../../../domain/repositories/reminders-queue.repository';
import { RemindersQueueModel } from '../models/reminders-queue.model';
import type { ReminderChannelValue } from '../../../domain/value-objects/reminder-channel.vo';

interface QueueAdminRow {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  offset_type: string;
  scheduled_for: Date;
  channel: string;
  message_body: string | null;
  status: string;
  attempts: number;
  last_attempt_at: Date | null;
  sent_at: Date | null;
  error_message: string | null;
  created_at: Date;
  doctor_name: string | null;
}

/**
 * Sequelize implementation of IRemindersQueueRepository.
 *
 * The listAll method uses a raw JOIN query to enrich rows with the doctor's
 * full_name from the profiles table — following the same pattern used in
 * SequelizeAdminRepository.
 *
 * listByDoctorId uses the ORM model since no JOIN is needed.
 */
@Injectable()
export class SequelizeRemindersQueueRepository implements IRemindersQueueRepository {
  constructor(
    @InjectModel(RemindersQueueModel)
    private readonly queueModel: typeof RemindersQueueModel,
    private readonly sequelize: Sequelize,
  ) {}

  async listByDoctorId(doctorId: string): Promise<ReminderQueueItem[]> {
    const rows = await this.queueModel.findAll({
      where: { doctorId } as Record<string, unknown>,
      order: [['scheduledFor', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async listAll(limit: number): Promise<ReminderQueueItem[]> {
    const rows = await this.sequelize.query<QueueAdminRow>(
      `
      SELECT
        rq.id,
        rq.appointment_id,
        rq.doctor_id,
        rq.patient_id,
        rq.offset_type,
        rq.scheduled_for,
        rq.channel,
        rq.message_body,
        rq.status,
        rq.attempts,
        rq.last_attempt_at,
        rq.sent_at,
        rq.error_message,
        rq.created_at,
        p.full_name AS doctor_name
      FROM reminders_queue rq
      LEFT JOIN profiles p ON p.id = rq.doctor_id
      ORDER BY rq.scheduled_for ASC
      LIMIT :limit
      `,
      {
        replacements: { limit },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r) => {
      const item = this.toDomainFromRaw(r);
      // Attach doctorName as a non-domain extension for the use-case to pick up
      return Object.assign(item, { doctorName: r.doctor_name ?? r.doctor_id });
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: RemindersQueueModel): ReminderQueueItem {
    return ReminderQueueItem.create({
      id: row.id,
      appointmentId: row.appointmentId,
      doctorId: row.doctorId,
      patientId: row.patientId ?? null,
      offsetType: row.offsetType,
      scheduledFor: row.scheduledFor,
      channel: row.channel as ReminderChannelValue,
      messageBody: row.messageBody ?? null,
      status: row.status as ReminderQueueStatus,
      attempts: row.attempts,
      lastAttemptAt: row.lastAttemptAt ?? null,
      sentAt: row.sentAt ?? null,
      errorMessage: row.errorMessage ?? null,
      createdAt: row.createdAt,
    });
  }

  private toDomainFromRaw(r: QueueAdminRow): ReminderQueueItem {
    return ReminderQueueItem.create({
      id: r.id,
      appointmentId: r.appointment_id,
      doctorId: r.doctor_id,
      patientId: r.patient_id ?? null,
      offsetType: r.offset_type,
      scheduledFor: r.scheduled_for,
      channel: r.channel as ReminderChannelValue,
      messageBody: r.message_body ?? null,
      status: r.status as ReminderQueueStatus,
      attempts: r.attempts,
      lastAttemptAt: r.last_attempt_at ?? null,
      sentAt: r.sent_at ?? null,
      errorMessage: r.error_message ?? null,
      createdAt: r.created_at,
    });
  }
}
