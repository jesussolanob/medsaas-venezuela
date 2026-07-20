import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import { ReminderQueueItem } from '../../../domain/entities/reminder-queue-item.entity';
import type { ReminderQueueStatus } from '../../../domain/entities/reminder-queue-item.entity';
import type {
  IRemindersQueueRepository,
  AppointmentDueRow,
  InsertQueueRowInput,
} from '../../../domain/repositories/reminders-queue.repository';
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

interface DueRow {
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  patient_email: string;
  patient_name: string | null;
  scheduled_at: Date;
  appointment_mode: string;
}

interface InsertResult {
  id: string;
}

/**
 * Sequelize implementation of IRemindersQueueRepository.
 *
 * The listAll method uses a raw JOIN query to enrich rows with the doctor's
 * full_name from the profiles table — following the same pattern used in
 * SequelizeAdminRepository.
 *
 * listByDoctorId uses the ORM model since no JOIN is needed.
 *
 * findDueForReminder uses a raw query with LEFT JOIN to reminders_settings
 * (to apply per-doctor enabled/channel/offset_type preferences, falling back
 * to DB column defaults when no settings row exists) and NOT EXISTS to
 * reminders_queue (idempotency check).
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

  async findDueForReminder(
    offsetType: string,
    windowStart: Date,
    windowEnd: Date,
    statuses: string[],
    cap: number,
  ): Promise<AppointmentDueRow[]> {
    // Whitelist offsetType → settings column name to prevent any SQL injection
    // risk from dynamic string interpolation into the query.
    const SETTINGS_COLUMN: Record<string, string> = {
      '24h': 'reminder_24h_enabled',
      '1h': 'reminder_1h_enabled',
    };
    const settingsColumn = SETTINGS_COLUMN[offsetType];
    if (!settingsColumn) {
      throw new Error(`Unknown offsetType for reminder dispatch: ${offsetType}`);
    }

    const rows = await this.sequelize.query<DueRow>(
      `
      SELECT
        a.id                  AS appointment_id,
        a.doctor_id,
        a.patient_id,
        a.patient_email,
        a.patient_name,
        a.scheduled_at,
        a.appointment_mode
      FROM appointments a
      LEFT JOIN reminders_settings rs ON rs.doctor_id = a.doctor_id
      WHERE
        a.status IN (:statuses)
        AND a.patient_email IS NOT NULL
        AND a.scheduled_at >= :windowStart
        AND a.scheduled_at <= :windowEnd
        -- Respect per-doctor settings (COALESCE provides the column-level default).
        AND COALESCE(rs.enabled, true) = true
        AND COALESCE(rs.channel, 'both') IN ('email', 'both')
        AND COALESCE(rs.${settingsColumn}, true) = true
        -- Idempotency: skip rows already present in the queue for this offsetType.
        AND NOT EXISTS (
          SELECT 1
          FROM reminders_queue rq
          WHERE rq.appointment_id = a.id
            AND rq.offset_type = :offsetType
        )
      ORDER BY a.scheduled_at ASC
      LIMIT :cap
      `,
      {
        replacements: { statuses, windowStart, windowEnd, offsetType, cap },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r) => ({
      appointmentId: r.appointment_id,
      doctorId: r.doctor_id,
      patientId: r.patient_id ?? null,
      patientEmail: r.patient_email,
      patientName: r.patient_name ?? null,
      scheduledAt: r.scheduled_at,
      appointmentMode: r.appointment_mode,
    }));
  }

  async insertPending(input: InsertQueueRowInput): Promise<string | null> {
    const id = randomUUID();
    const rows = await this.sequelize.query<InsertResult>(
      `
      INSERT INTO reminders_queue
        (id, appointment_id, doctor_id, patient_id, offset_type, scheduled_for, channel, status, attempts, created_at)
      VALUES
        (:id, :appointmentId, :doctorId, :patientId, :offsetType, :scheduledFor, :channel, 'pending', 0, NOW())
      ON CONFLICT (appointment_id, offset_type) DO NOTHING
      RETURNING id
      `,
      {
        replacements: {
          id,
          appointmentId: input.appointmentId,
          doctorId: input.doctorId,
          patientId: input.patientId,
          offsetType: input.offsetType,
          scheduledFor: input.scheduledFor,
          channel: input.channel,
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows[0]?.id ?? null;
  }

  async markSent(rowId: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE reminders_queue SET status = 'sent', sent_at = NOW() WHERE id = :rowId`,
      { replacements: { rowId }, type: QueryTypes.UPDATE },
    );
  }

  async markFailed(rowId: string, errorMessage: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE reminders_queue
       SET status = 'failed',
           attempts = attempts + 1,
           last_attempt_at = NOW(),
           error_message = :errorMessage
       WHERE id = :rowId`,
      { replacements: { rowId, errorMessage }, type: QueryTypes.UPDATE },
    );
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
