import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ContactRequest } from '../../../domain/entities/contact-request.entity';
import type {
  IContactRequestRepository,
  SaveContactRequestParams,
  UpdateContactRequestParams,
  ListContactRequestsFilter,
  ListContactRequestsResult,
  ContactRequestWithDoctor,
  SuperAdminRow,
  AppSettingRow,
} from '../../../domain/repositories/icontact-request.repository';
import { ContactRequestModel } from '../models/contact-request.model';
import { ContactProfileModel } from '../models/contact-profile.model';

/**
 * Sequelize implementation of IContactRequestRepository.
 *
 * Raw SQL rules:
 *   - Always use IN (:ids) style replacements — NEVER = ANY(:ids) (Postgres only,
 *     breaks in tests with the Sequelize simulator).
 *   - TIMESTAMPTZ columns are always read as Date objects (Sequelize handles this).
 *   - No encryption on contact_requests (no PII there per spec).
 *
 * IMPORTANT: Sequelize is injected via the global instance provided in AppModule —
 * never add it to this module's providers[] array.
 */
@Injectable()
export class SequelizeContactRequestRepository implements IContactRequestRepository {
  constructor(
    @InjectModel(ContactRequestModel)
    private readonly model: typeof ContactRequestModel,
    @InjectModel(ContactProfileModel)
    private readonly profileModel: typeof ContactProfileModel,
    private readonly sequelize: Sequelize,
  ) {}

  async save(params: SaveContactRequestParams): Promise<ContactRequest> {
    const row = await this.model.create({
      id: params.id,
      doctorId: params.doctorId,
      channel: params.channel,
      message: params.message,
      status: params.status,
      handledBy: params.handledBy,
      handledAt: params.handledAt,
      notes: params.notes,
      notificationCount: params.notificationCount,
      lastNotifiedAt: params.lastNotifiedAt,
    });

    return this.toDomain(row);
  }

  async updatePendingForDoctor(
    doctorId: string,
    params: { channel: string; message: string | null },
  ): Promise<ContactRequest | null> {
    await this.model.update(
      {
        channel: params.channel,
        message: params.message,
      },
      {
        where: {
          doctorId,
          status: 'pending',
        },
      },
    );

    const row = await this.model.findOne({
      where: { doctorId, status: 'pending' },
    });

    if (!row) return null;
    return this.toDomain(row);
  }

  async findPendingByDoctorId(doctorId: string): Promise<ContactRequest | null> {
    const row = await this.model.findOne({
      where: { doctorId, status: 'pending' },
    });

    if (!row) return null;
    return this.toDomain(row);
  }

  async findById(id: string): Promise<ContactRequest | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async update(id: string, params: UpdateContactRequestParams): Promise<ContactRequest> {
    const row = await this.model.findByPk(id);
    if (!row) {
      // Caller is responsible for checking existence before update
      throw new Error(`contact_requests row not found: ${id}`);
    }

    const updatePayload: Record<string, unknown> = {};
    if (params.status !== undefined) updatePayload['status'] = params.status;
    if (params.handledBy !== undefined) updatePayload['handledBy'] = params.handledBy;
    if (params.handledAt !== undefined) updatePayload['handledAt'] = params.handledAt;
    if ('notes' in params) updatePayload['notes'] = params.notes ?? null;

    await row.update(updatePayload);
    return this.toDomain(row);
  }

  async getNotificationCountSince(doctorId: string, since: Date): Promise<number> {
    // Uses the notification_count on the pending request + last_notified_at
    // as a simple approximation. If last_notified_at is within the window,
    // return notification_count; otherwise reset conceptually to 0.
    const row = await this.model.findOne({
      where: { doctorId, status: 'pending' },
      attributes: ['notification_count', 'last_notified_at'],
    });

    if (!row) return 0;
    if (!row.lastNotifiedAt) return 0;

    // If the last notification was sent within the window, return the count
    return row.lastNotifiedAt >= since ? row.notificationCount : 0;
  }

  async incrementNotificationCount(doctorId: string, at: Date): Promise<void> {
    await this.model.update(
      {
        notificationCount: this.sequelize.literal('notification_count + 1') as unknown as number,
        lastNotifiedAt: at,
      },
      {
        where: { doctorId, status: 'pending' },
      },
    );
  }

  async reserveNotificationSlot(
    doctorId: string,
    since: Date,
    now: Date,
    max: number,
  ): Promise<boolean> {
    // Count ALL notifications for this doctor in the window (across every request
    // row, not just the current pending one) so resolving a request does not
    // reset the daily limit.  The UPDATE atomically increments only if the
    // window count is still below max, eliminating the TOCTOU race.
    const rows = await this.sequelize.query<{ id: string }>(
      `WITH window_count AS (
         SELECT COALESCE(SUM(notification_count), 0) AS total
           FROM contact_requests
          WHERE doctor_id = :doctorId
            AND last_notified_at >= :since
       )
       UPDATE contact_requests
          SET notification_count = notification_count + 1,
              last_notified_at   = :now,
              updated_at         = :now
        WHERE doctor_id = :doctorId
          AND status    = 'pending'
          AND (SELECT total FROM window_count) < :max
       RETURNING id`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId, since, now, max },
      },
    );
    return rows.length > 0;
  }

  async listWithDoctor(filter: ListContactRequestsFilter): Promise<ListContactRequestsResult> {
    const conditions: string[] = [];
    const replacements: Record<string, unknown> = {
      limit: filter.limit,
      offset: filter.offset,
    };

    if (filter.status) {
      conditions.push(`cr.status = :status`);
      replacements['status'] = filter.status;
    }
    if (filter.from) {
      conditions.push(`cr.created_at >= :from`);
      replacements['from'] = filter.from;
    }
    if (filter.to) {
      conditions.push(`cr.created_at <= :to`);
      replacements['to'] = filter.to;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    type RawRow = {
      id: string;
      doctor_id: string;
      doctor_name: string | null;
      doctor_email: string;
      doctor_phone: string | null;
      doctor_plan: string | null;
      doctor_specialty: string | null;
      channel: string;
      message: string | null;
      status: string;
      handled_by: string | null;
      handled_at: Date | null;
      notes: string | null;
      notification_count: number;
      last_notified_at: Date | null;
      created_at: Date;
      updated_at: Date;
      total_count: string;
    };

    const rows = await this.sequelize.query<RawRow>(
      `SELECT
         cr.id,
         cr.doctor_id,
         p.full_name AS doctor_name,
         p.email AS doctor_email,
         p.phone AS doctor_phone,
         p.plan AS doctor_plan,
         p.specialty AS doctor_specialty,
         cr.channel,
         cr.message,
         cr.status,
         cr.handled_by,
         cr.handled_at,
         cr.notes,
         cr.notification_count,
         cr.last_notified_at,
         cr.created_at,
         cr.updated_at,
         COUNT(*) OVER () AS total_count
       FROM contact_requests cr
       LEFT JOIN profiles p ON p.id = cr.doctor_id
       ${whereClause}
       ORDER BY cr.created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        type: QueryTypes.SELECT,
        replacements,
      },
    );

    const total = rows.length > 0 ? parseInt(String(rows[0]!.total_count), 10) : 0;

    const items: ContactRequestWithDoctor[] = rows.map((r) => ({
      id: r.id,
      doctorId: r.doctor_id,
      doctorName: r.doctor_name ?? 'Sin nombre',
      doctorEmail: r.doctor_email,
      doctorPhone: r.doctor_phone,
      doctorPlan: r.doctor_plan ?? 'N/A',
      doctorSpecialty: r.doctor_specialty,
      channel: r.channel,
      message: r.message,
      status: r.status as ContactRequestWithDoctor['status'],
      handledBy: r.handled_by,
      handledAt: r.handled_at,
      notes: r.notes,
      notificationCount: r.notification_count,
      lastNotifiedAt: r.last_notified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { items, total };
  }

  async findByIdWithDoctor(id: string): Promise<ContactRequestWithDoctor | null> {
    type RawRow = {
      id: string;
      doctor_id: string;
      doctor_name: string | null;
      doctor_email: string;
      doctor_phone: string | null;
      doctor_plan: string | null;
      doctor_specialty: string | null;
      channel: string;
      message: string | null;
      status: string;
      handled_by: string | null;
      handled_at: Date | null;
      notes: string | null;
      notification_count: number;
      last_notified_at: Date | null;
      created_at: Date;
      updated_at: Date;
    };

    const rows = await this.sequelize.query<RawRow>(
      `SELECT
         cr.id,
         cr.doctor_id,
         p.full_name AS doctor_name,
         p.email AS doctor_email,
         p.phone AS doctor_phone,
         p.plan AS doctor_plan,
         p.specialty AS doctor_specialty,
         cr.channel,
         cr.message,
         cr.status,
         cr.handled_by,
         cr.handled_at,
         cr.notes,
         cr.notification_count,
         cr.last_notified_at,
         cr.created_at,
         cr.updated_at
       FROM contact_requests cr
       LEFT JOIN profiles p ON p.id = cr.doctor_id
       WHERE cr.id = :id`,
      {
        type: QueryTypes.SELECT,
        replacements: { id },
      },
    );

    if (rows.length === 0) return null;
    const r = rows[0]!;

    return {
      id: r.id,
      doctorId: r.doctor_id,
      doctorName: r.doctor_name ?? 'Sin nombre',
      doctorEmail: r.doctor_email,
      doctorPhone: r.doctor_phone,
      doctorPlan: r.doctor_plan ?? 'N/A',
      doctorSpecialty: r.doctor_specialty,
      channel: r.channel,
      message: r.message,
      status: r.status as ContactRequestWithDoctor['status'],
      handledBy: r.handled_by,
      handledAt: r.handled_at,
      notes: r.notes,
      notificationCount: r.notification_count,
      lastNotifiedAt: r.last_notified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async countPending(): Promise<number> {
    return this.model.count({ where: { status: 'pending' } });
  }

  async findAllSuperAdmins(): Promise<SuperAdminRow[]> {
    const rows = await this.profileModel.findAll({
      where: { role: 'super_admin' },
      attributes: ['id', 'email', 'fullName'],
    });

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName ?? 'Administrador',
    }));
  }

  async getSettings(keys: string[]): Promise<AppSettingRow[]> {
    if (keys.length === 0) return [];

    const rows = await this.sequelize.query<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE key IN (:keys)`,
      {
        type: QueryTypes.SELECT,
        replacements: { keys },
      },
    );

    return rows.map((r) => ({ key: r.key, value: r.value }));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: ContactRequestModel): ContactRequest {
    return ContactRequest.create({
      id: row.id,
      doctorId: row.doctorId,
      channel: row.channel as ContactRequest['channel'],
      message: row.message,
      status: row.status as ContactRequest['status'],
      handledBy: row.handledBy,
      handledAt: row.handledAt,
      notes: row.notes,
      notificationCount: row.notificationCount,
      lastNotifiedAt: row.lastNotifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
