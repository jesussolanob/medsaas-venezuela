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
  AppointmentDueRowWhatsApp,
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

interface DueRowWhatsApp {
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  patient_phone: string | null;
  patient_name: string | null;
  scheduled_at: Date;
  appointment_mode: string;
  office_name: string | null;
  consultation_payment_status: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface CountRow {
  count: string;
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
        -- Idempotency: skip rows already present in the queue for this offsetType+email.
        -- Channel is now part of the unique constraint; scope to 'email' so that a
        -- WhatsApp row for the same appointment does NOT block the email row.
        AND NOT EXISTS (
          SELECT 1
          FROM reminders_queue rq
          WHERE rq.appointment_id = a.id
            AND rq.offset_type = :offsetType
            AND rq.channel = 'email'
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
      ON CONFLICT (appointment_id, offset_type, channel) DO NOTHING
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

    const rowId = rows[0]?.id ?? null;

    // Optionally record Zernio external IDs in the same transaction-like sequence.
    if (rowId && (input.externalMessageId || input.externalConversationId)) {
      await this.updateExternalIds(
        rowId,
        input.externalMessageId ?? '',
        input.externalConversationId ?? '',
      );
    }

    return rowId;
  }

  async findDueForWhatsAppReminder(
    offsetType: string,
    windowStart: Date,
    windowEnd: Date,
    statuses: string[],
    cap: number,
  ): Promise<AppointmentDueRowWhatsApp[]> {
    // Whitelist offsetType → settings column to prevent SQL injection via interpolation.
    const SETTINGS_COLUMN: Record<string, string> = {
      '24h': 'reminder_24h_enabled',
      '3h': 'reminder_3h_enabled',
    };
    const settingsColumn = SETTINGS_COLUMN[offsetType];
    if (!settingsColumn) {
      throw new Error(`Unknown offsetType for WhatsApp reminder dispatch: ${offsetType}`);
    }

    const rows = await this.sequelize.query<DueRowWhatsApp>(
      `
      SELECT
        a.id                        AS appointment_id,
        a.doctor_id,
        a.patient_id,
        a.patient_phone,
        a.patient_name,
        a.scheduled_at,
        a.appointment_mode,
        dof.name                    AS office_name,
        cons.payment_status         AS consultation_payment_status,
        rs.quiet_hours_start,
        rs.quiet_hours_end
      FROM appointments a
      LEFT JOIN reminders_settings rs ON rs.doctor_id = a.doctor_id
      LEFT JOIN doctor_offices dof    ON dof.id = a.office_id
      -- Opt-out: skip patients who have opted out of WhatsApp reminders.
      LEFT JOIN patients pt           ON pt.id = a.patient_id
      -- LATERAL ensures exactly one consultation row per appointment (most recent).
      LEFT JOIN LATERAL (
        SELECT payment_status
        FROM consultations
        WHERE appointment_id = a.id
        ORDER BY created_at DESC
        LIMIT 1
      ) cons ON true
      WHERE
        a.status IN (:statuses)
        AND a.patient_phone IS NOT NULL
        AND a.scheduled_at >= :windowStart
        AND a.scheduled_at <= :windowEnd
        -- Respect patient opt-out.
        AND COALESCE(pt.whatsapp_opt_out, false) = false
        -- Respect per-doctor settings.
        AND COALESCE(rs.enabled, true) = true
        AND COALESCE(rs.channel, 'both') IN ('whatsapp', 'both')
        AND COALESCE(rs.${settingsColumn}, true) = true
        -- Idempotency: skip rows already queued as WhatsApp for this offsetType.
        AND NOT EXISTS (
          SELECT 1
          FROM reminders_queue rq
          WHERE rq.appointment_id = a.id
            AND rq.offset_type = :offsetType
            AND rq.channel = 'whatsapp'
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
      patientPhone: r.patient_phone ?? null,
      patientName: r.patient_name ?? null,
      scheduledAt: r.scheduled_at,
      appointmentMode: r.appointment_mode,
      officeName: r.office_name ?? null,
      consultationPaymentStatus: r.consultation_payment_status ?? null,
      quietHoursStart: r.quiet_hours_start ?? null,
      quietHoursEnd: r.quiet_hours_end ?? null,
    }));
  }

  async countWhatsAppUniqueRecipientsLast24h(): Promise<number> {
    const rows = await this.sequelize.query<CountRow>(
      `
      SELECT COUNT(DISTINCT patient_id) AS count
      FROM reminders_queue
      WHERE channel = 'whatsapp'
        AND status = 'sent'
        AND sent_at >= NOW() - INTERVAL '24 hours'
        AND patient_id IS NOT NULL
      `,
      { type: QueryTypes.SELECT },
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  async updateExternalIds(
    rowId: string,
    externalMessageId: string,
    externalConversationId: string,
  ): Promise<void> {
    await this.sequelize.query(
      `UPDATE reminders_queue
       SET external_message_id = :externalMessageId,
           external_conversation_id = :externalConversationId
       WHERE id = :rowId`,
      {
        replacements: { rowId, externalMessageId, externalConversationId },
        type: QueryTypes.UPDATE,
      },
    );
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

  async findByExternalMessageId(
    externalMessageId: string,
    channel: string,
  ): Promise<{ rowId: string; appointmentId: string; doctorId: string } | null> {
    const rows = await this.sequelize.query<{
      id: string;
      appointment_id: string;
      doctor_id: string;
    }>(
      `SELECT id, appointment_id, doctor_id
       FROM reminders_queue
       WHERE external_message_id = :externalMessageId
         AND channel = :channel
       LIMIT 1`,
      {
        replacements: { externalMessageId, channel },
        type: QueryTypes.SELECT,
      },
    );
    const row = rows[0];
    return row
      ? { rowId: row.id, appointmentId: row.appointment_id, doctorId: row.doctor_id }
      : null;
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
