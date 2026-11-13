import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ReleaseNote } from '../../../domain/entities/release-note.entity';
import type {
  IReleaseNoteRepository,
  CreateReleaseNoteParams,
  UpdateReleaseNoteParams,
  AdminListFilter,
  AdminListResult,
  AdminListItem,
  UnseenNoteItem,
} from '../../../domain/repositories/irelease-note.repository';
import { ReleaseNoteModel } from '../models/release-note.model';
import { ReleaseNoteProfileModel } from '../models/release-note-profile.model';

/**
 * Sequelize implementation of IReleaseNoteRepository.
 *
 * Raw SQL rules:
 *   - Always use IN (:ids) style replacements — NEVER = ANY(:ids) for bound JS arrays
 *     (Postgres ARRAY COLUMN usage `= ANY(column)` with a scalar binding is fine).
 *   - TIMESTAMPTZ columns are always read as Date objects (Sequelize handles this).
 *   - audience_plans is a TEXT[] column — use `:plan = ANY(audience_plans)` to check
 *     membership (scalar on left, column array on right — no array binding involved).
 *
 * IMPORTANT: Sequelize is injected via the global instance provided in AppModule —
 * never add it to this module's providers[] array.
 */
@Injectable()
export class SequelizeReleaseNoteRepository implements IReleaseNoteRepository {
  constructor(
    @InjectModel(ReleaseNoteModel)
    private readonly model: typeof ReleaseNoteModel,
    @InjectModel(ReleaseNoteProfileModel)
    private readonly profileModel: typeof ReleaseNoteProfileModel,
    private readonly sequelize: Sequelize,
  ) {}

  async create(params: CreateReleaseNoteParams): Promise<ReleaseNote> {
    const row = await this.model.create({
      id: params.id,
      title: params.title,
      body: params.body,
      imageUrl: params.imageUrl,
      audiencePlans: params.audiencePlans,
      publishedAt: params.publishedAt,
      createdBy: params.createdBy,
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<ReleaseNote | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async adminList(filter: AdminListFilter): Promise<AdminListResult> {
    const conditions: string[] = [];
    const replacements: Record<string, unknown> = {
      limit: filter.limit,
      offset: filter.offset,
    };

    if (filter.status === 'draft') {
      conditions.push('rn.published_at IS NULL');
    } else if (filter.status === 'published') {
      conditions.push('rn.published_at IS NOT NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    type RawRow = {
      id: string;
      title: string;
      body: string;
      image_url: string | null;
      audience_plans: string[] | null;
      published_at: Date | null;
      created_by: string | null;
      created_by_name: string | null;
      created_at: Date;
      updated_at: Date;
      total_count: string;
    };

    const rows = await this.sequelize.query<RawRow>(
      `SELECT
         rn.id,
         rn.title,
         rn.body,
         rn.image_url,
         rn.audience_plans,
         rn.published_at,
         rn.created_by,
         p.full_name AS created_by_name,
         rn.created_at,
         rn.updated_at,
         COUNT(*) OVER () AS total_count
       FROM release_notes rn
       LEFT JOIN profiles p ON p.id = rn.created_by
       ${whereClause}
       ORDER BY
         CASE WHEN rn.published_at IS NULL THEN rn.updated_at ELSE rn.published_at END DESC
       LIMIT :limit OFFSET :offset`,
      {
        type: QueryTypes.SELECT,
        replacements,
      },
    );

    const total = rows.length > 0 ? parseInt(String(rows[0]!.total_count), 10) : 0;

    const items: AdminListItem[] = rows.map((r) => {
      const note = ReleaseNote.create({
        id: r.id,
        title: r.title,
        body: r.body,
        imageUrl: r.image_url,
        audiencePlans: r.audience_plans,
        publishedAt: r.published_at,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
      return { ...note, createdByName: r.created_by_name };
    });

    return { items, total };
  }

  async update(id: string, params: UpdateReleaseNoteParams): Promise<ReleaseNote> {
    const row = await this.model.findByPk(id);
    if (!row) {
      throw new Error(`release_notes row not found: ${id}`);
    }

    const payload: Record<string, unknown> = {};
    if (params.title !== undefined) payload['title'] = params.title;
    if (params.body !== undefined) payload['body'] = params.body;
    if ('imageUrl' in params) payload['imageUrl'] = params.imageUrl ?? null;
    if ('audiencePlans' in params) payload['audiencePlans'] = params.audiencePlans ?? null;

    await row.update(payload);
    return this.toDomain(row);
  }

  async publish(id: string, publishedAt: Date): Promise<ReleaseNote> {
    const row = await this.model.findByPk(id);
    if (!row) throw new Error(`release_notes row not found: ${id}`);
    await row.update({ publishedAt });
    return this.toDomain(row);
  }

  async unpublish(id: string): Promise<ReleaseNote> {
    const row = await this.model.findByPk(id);
    if (!row) throw new Error(`release_notes row not found: ${id}`);
    await row.update({ publishedAt: null });
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.model.destroy({ where: { id } });
  }

  async findUnseenForDoctor(doctorId: string): Promise<UnseenNoteItem[]> {
    type RawRow = {
      id: string;
      title: string;
      body: string;
      image_url: string | null;
      published_at: Date;
    };

    // p.plan = ANY(rn.audience_plans) uses a scalar column value against a TEXT[]
    // column — this is Postgres-native and is NOT the forbidden "= ANY(:ids)" pattern
    // (which would bind a JS array). No JS array is bound here.
    const rows = await this.sequelize.query<RawRow>(
      `SELECT
         rn.id,
         rn.title,
         rn.body,
         rn.image_url,
         rn.published_at
       FROM release_notes rn
       JOIN profiles p ON p.id = :doctorId
       WHERE rn.published_at IS NOT NULL
         AND (rn.audience_plans IS NULL OR p.plan = ANY(rn.audience_plans))
         AND rn.published_at > GREATEST(
               COALESCE(p.release_notes_seen_at, '-infinity'::timestamptz),
               p.created_at
             )
       ORDER BY rn.published_at DESC
       LIMIT 5`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      imageUrl: r.image_url,
      publishedAt: r.published_at,
    }));
  }

  async findPublishedForDoctor(doctorId: string): Promise<UnseenNoteItem[]> {
    type RawRow = {
      id: string;
      title: string;
      body: string;
      image_url: string | null;
      published_at: Date;
    };

    // p.plan = ANY(rn.audience_plans): scalar column value against TEXT[] column.
    const rows = await this.sequelize.query<RawRow>(
      `SELECT
         rn.id,
         rn.title,
         rn.body,
         rn.image_url,
         rn.published_at
       FROM release_notes rn
       JOIN profiles p ON p.id = :doctorId
       WHERE rn.published_at IS NOT NULL
         AND (rn.audience_plans IS NULL OR p.plan = ANY(rn.audience_plans))
       ORDER BY rn.published_at DESC
       LIMIT 50`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      imageUrl: r.image_url,
      publishedAt: r.published_at,
    }));
  }

  async markSeen(doctorId: string, seenAt: Date): Promise<void> {
    await this.profileModel.update({ releaseNotesSeenAt: seenAt }, { where: { id: doctorId } });
  }

  async findAllPlanKeys(): Promise<string[]> {
    const rows = await this.sequelize.query<{ plan_key: string }>(
      `SELECT plan_key FROM plan_configs WHERE is_active = true ORDER BY plan_key`,
      { type: QueryTypes.SELECT },
    );

    return rows.map((r) => r.plan_key);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: ReleaseNoteModel): ReleaseNote {
    return ReleaseNote.create({
      id: row.id,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl,
      audiencePlans: row.audiencePlans,
      publishedAt: row.publishedAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
