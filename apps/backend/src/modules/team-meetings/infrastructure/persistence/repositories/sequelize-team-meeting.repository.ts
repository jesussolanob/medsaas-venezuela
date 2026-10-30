import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { TeamMeeting } from '../../../domain/entities/team-meeting.entity';
import type {
  ITeamMeetingRepository,
  CreateTeamMeetingParams,
  UpdateTeamMeetingParams,
  ListTeamMeetingsFilter,
  ListTeamMeetingsResult,
  TeamMeetingWithDoctor,
  AppSettingRow,
  SuperAdminRow,
  DoctorAppointmentRow,
  OfficeScheduleRow,
  AvailabilityBlockRow,
  MeetingReminderRow,
} from '../../../domain/repositories/iteam-meeting.repository';
import { TeamMeetingModel } from '../models/team-meeting.model';

/**
 * Sequelize implementation of ITeamMeetingRepository.
 *
 * Raw SQL rules:
 *   - Use IN (:ids) style replacements — NEVER = ANY(:ids).
 *   - No PII in logs.
 *
 * IMPORTANT: Sequelize is provided globally in AppModule.
 * Never add it to module providers.
 */
@Injectable()
export class SequelizeTeamMeetingRepository implements ITeamMeetingRepository {
  constructor(
    @InjectModel(TeamMeetingModel)
    private readonly model: typeof TeamMeetingModel,
    private readonly sequelize: Sequelize,
  ) {}

  async create(params: CreateTeamMeetingParams): Promise<TeamMeeting> {
    const row = await this.model.create({
      id: params.id,
      doctorId: params.doctorId,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      status: params.status,
      meetingUrl: params.meetingUrl,
      externalEventId: params.externalEventId,
      availabilityBlockId: params.availabilityBlockId,
      source: params.source,
      notes: params.notes,
    });
    return this.toDomain(row);
  }

  async findScheduledByDoctor(doctorId: string): Promise<TeamMeeting | null> {
    const row = await this.model.findOne({
      where: { doctorId, status: 'scheduled' },
    });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<TeamMeeting | null> {
    const row = await this.model.findByPk(id);
    return row ? this.toDomain(row) : null;
  }

  async update(id: string, params: UpdateTeamMeetingParams): Promise<TeamMeeting> {
    const row = await this.model.findByPk(id);
    if (!row) throw new Error(`TeamMeeting not found: ${id}`);

    await row.update({
      ...(params.status !== undefined && { status: params.status }),
      ...(params.meetingUrl !== undefined && { meetingUrl: params.meetingUrl }),
      ...(params.externalEventId !== undefined && { externalEventId: params.externalEventId }),
      ...(params.availabilityBlockId !== undefined && {
        availabilityBlockId: params.availabilityBlockId,
      }),
      ...(params.startsAt !== undefined && { startsAt: params.startsAt }),
      ...(params.endsAt !== undefined && { endsAt: params.endsAt }),
      ...(params.notes !== undefined && { notes: params.notes }),
      ...(params.reminder24hSentAt !== undefined && {
        reminder24hSentAt: params.reminder24hSentAt,
      }),
      ...(params.reminder1hSentAt !== undefined && { reminder1hSentAt: params.reminder1hSentAt }),
    });

    return this.toDomain(row);
  }

  async listWithDoctor(filter: ListTeamMeetingsFilter): Promise<ListTeamMeetingsResult> {
    const conditions: string[] = [];
    const replacements: Record<string, unknown> = {};

    if (filter.status) {
      conditions.push('tm.status = :status');
      replacements['status'] = filter.status;
    }
    if (filter.from) {
      conditions.push('tm.starts_at >= :from');
      replacements['from'] = filter.from;
    }
    if (filter.to) {
      conditions.push('tm.starts_at <= :to');
      replacements['to'] = filter.to;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM team_meetings tm ${where}`,
      { type: QueryTypes.SELECT, replacements },
    );
    const total = parseInt(countRows[0]?.cnt ?? '0', 10);

    const rows = await this.sequelize.query<{
      id: string;
      doctor_id: string;
      doctor_name: string | null;
      doctor_email: string | null;
      doctor_phone: string | null;
      doctor_plan: string | null;
      doctor_specialty: string | null;
      starts_at: Date;
      ends_at: Date;
      status: string;
      meeting_url: string | null;
      external_event_id: string | null;
      availability_block_id: string | null;
      source: string;
      notes: string | null;
      reminder_24h_sent_at: Date | null;
      reminder_1h_sent_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         tm.id,
         tm.doctor_id,
         p.full_name       AS doctor_name,
         p.email           AS doctor_email,
         p.phone           AS doctor_phone,
         p.plan            AS doctor_plan,
         p.specialty       AS doctor_specialty,
         tm.starts_at,
         tm.ends_at,
         tm.status,
         tm.meeting_url,
         tm.external_event_id,
         tm.availability_block_id,
         tm.source,
         tm.notes,
         tm.reminder_24h_sent_at,
         tm.reminder_1h_sent_at,
         tm.created_at,
         tm.updated_at
       FROM team_meetings tm
       LEFT JOIN profiles p ON p.id = tm.doctor_id
       ${where}
       ORDER BY tm.starts_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        type: QueryTypes.SELECT,
        replacements: { ...replacements, limit: filter.limit, offset: filter.offset },
      },
    );

    const items: TeamMeetingWithDoctor[] = rows.map((r) => ({
      id: r.id,
      doctorId: r.doctor_id,
      doctorName: r.doctor_name ?? '',
      doctorEmail: r.doctor_email ?? '',
      doctorPhone: r.doctor_phone,
      doctorPlan: r.doctor_plan,
      doctorSpecialty: r.doctor_specialty,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status as TeamMeetingWithDoctor['status'],
      meetingUrl: r.meeting_url,
      externalEventId: r.external_event_id,
      availabilityBlockId: r.availability_block_id,
      source: r.source,
      notes: r.notes,
      reminder24hSentAt: r.reminder_24h_sent_at,
      reminder1hSentAt: r.reminder_1h_sent_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { items, total };
  }

  async findAllSuperAdmins(): Promise<SuperAdminRow[]> {
    const rows = await this.sequelize.query<{
      id: string;
      email: string;
      full_name: string | null;
    }>(`SELECT id, email, full_name FROM profiles WHERE role = 'super_admin'`, {
      type: QueryTypes.SELECT,
    });
    return rows.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name }));
  }

  async getSettings(keys: string[]): Promise<AppSettingRow[]> {
    if (keys.length === 0) return [];
    const rows = await this.sequelize.query<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE key IN (:keys)`,
      { type: QueryTypes.SELECT, replacements: { keys } },
    );
    return rows.map((r) => ({ key: r.key, value: r.value }));
  }

  async updateSetting(key: string, value: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE app_settings SET value = :value, updated_at = NOW() WHERE key = :key`,
      { type: QueryTypes.UPDATE, replacements: { key, value } },
    );
  }

  async getDoctorProfile(
    doctorId: string,
  ): Promise<{
    name: string | null;
    email: string;
    phone: string | null;
    specialty: string | null;
  } | null> {
    const rows = await this.sequelize.query<{
      full_name: string | null;
      email: string;
      phone: string | null;
      specialty: string | null;
    }>(
      `SELECT full_name, email, phone, specialty
         FROM profiles
        WHERE id = :doctorId
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );
    const r = rows[0];
    if (!r) return null;
    return { name: r.full_name, email: r.email, phone: r.phone, specialty: r.specialty };
  }

  async getActiveOfficeSchedules(doctorId: string): Promise<OfficeScheduleRow[]> {
    const rows = await this.sequelize.query<{
      office_day: number;
      start_time: string;
      end_time: string;
      slot_duration: number;
      buffer_minutes: number;
    }>(
      `SELECT
         (sched->>'day')::int                                           AS office_day,
         sched->>'start'                                                AS start_time,
         sched->>'end'                                                  AS end_time,
         COALESCE((sched->>'slotDuration')::int, o.slot_duration)      AS slot_duration,
         COALESCE((sched->>'bufferMinutes')::int, o.buffer_minutes)    AS buffer_minutes
       FROM doctor_offices o,
            jsonb_array_elements(o.schedule::jsonb) AS sched
       WHERE o.doctor_id = :doctorId
         AND o.is_active = true
         AND (sched->>'enabled')::boolean = true`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );

    return rows.map((r) => ({
      officeDay: r.office_day,
      startTime: r.start_time,
      endTime: r.end_time,
      slotDuration: r.slot_duration,
      bufferMinutes: r.buffer_minutes,
    }));
  }

  async getAppointmentsInRange(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<DoctorAppointmentRow[]> {
    const rows = await this.sequelize.query<{
      scheduled_at: Date;
      duration_minutes: number | null;
    }>(
      `SELECT scheduled_at, duration_minutes
         FROM appointments
        WHERE doctor_id = :doctorId
          AND status NOT IN ('cancelled', 'no_show')
          AND scheduled_at >= :from
          AND scheduled_at < :to`,
      { type: QueryTypes.SELECT, replacements: { doctorId, from, to } },
    );
    return rows.map((r) => ({
      scheduledAt: r.scheduled_at,
      durationMinutes: r.duration_minutes,
    }));
  }

  async getAvailabilityBlocksInRange(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<AvailabilityBlockRow[]> {
    const rows = await this.sequelize.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at
         FROM doctor_availability_blocks
        WHERE doctor_id = :doctorId
          AND starts_at < :to
          AND ends_at   > :from`,
      { type: QueryTypes.SELECT, replacements: { doctorId, from, to } },
    );
    return rows.map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));
  }

  async findMeetingsNeedingReminder(now: Date, cap: number): Promise<MeetingReminderRow[]> {
    // 24h window: starts in [22h, 26h]
    // 1h window:  starts in [45min, 75min]
    const window24hStart = new Date(now.getTime() + 22 * 60 * 60 * 1000);
    const window24hEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const window1hStart = new Date(now.getTime() + 45 * 60 * 1000);
    const window1hEnd = new Date(now.getTime() + 75 * 60 * 1000);

    const rows = await this.sequelize.query<{
      id: string;
      doctor_id: string;
      doctor_email: string;
      doctor_name: string | null;
      starts_at: Date;
      meeting_url: string | null;
      reminder_24h_sent_at: Date | null;
      reminder_1h_sent_at: Date | null;
    }>(
      `SELECT
         tm.id,
         tm.doctor_id,
         p.email       AS doctor_email,
         p.full_name   AS doctor_name,
         tm.starts_at,
         tm.meeting_url,
         tm.reminder_24h_sent_at,
         tm.reminder_1h_sent_at
       FROM team_meetings tm
       LEFT JOIN profiles p ON p.id = tm.doctor_id
       WHERE tm.status = 'scheduled'
         AND (
           (tm.reminder_24h_sent_at IS NULL
            AND tm.starts_at >= :window24hStart
            AND tm.starts_at <= :window24hEnd)
           OR
           (tm.reminder_1h_sent_at IS NULL
            AND tm.starts_at >= :window1hStart
            AND tm.starts_at <= :window1hEnd)
         )
       LIMIT :cap`,
      {
        type: QueryTypes.SELECT,
        replacements: { window24hStart, window24hEnd, window1hStart, window1hEnd, cap },
      },
    );

    return rows.map((r) => ({
      id: r.id,
      doctorId: r.doctor_id,
      doctorEmail: r.doctor_email,
      doctorName: r.doctor_name,
      startsAt: r.starts_at,
      meetingUrl: r.meeting_url,
      reminder24hSentAt: r.reminder_24h_sent_at,
      reminder1hSentAt: r.reminder_1h_sent_at,
    }));
  }

  async markReminder24hSent(id: string, sentAt: Date): Promise<void> {
    await this.sequelize.query(
      `UPDATE team_meetings SET reminder_24h_sent_at = :sentAt WHERE id = :id AND reminder_24h_sent_at IS NULL`,
      { type: QueryTypes.UPDATE, replacements: { id, sentAt } },
    );
  }

  async markReminder1hSent(id: string, sentAt: Date): Promise<void> {
    await this.sequelize.query(
      `UPDATE team_meetings SET reminder_1h_sent_at = :sentAt WHERE id = :id AND reminder_1h_sent_at IS NULL`,
      { type: QueryTypes.UPDATE, replacements: { id, sentAt } },
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: TeamMeetingModel): TeamMeeting {
    return TeamMeeting.create({
      id: row.id,
      doctorId: row.doctorId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      meetingUrl: row.meetingUrl,
      externalEventId: row.externalEventId,
      availabilityBlockId: row.availabilityBlockId,
      source: row.source,
      notes: row.notes,
      reminder24hSentAt: row.reminder24hSentAt,
      reminder1hSentAt: row.reminder1hSentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
