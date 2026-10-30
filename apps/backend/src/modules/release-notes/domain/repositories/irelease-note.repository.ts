import type { ReleaseNote } from '../entities/release-note.entity';

export const RELEASE_NOTE_REPOSITORY = Symbol('IReleaseNoteRepository');

/** Status filter for admin list. */
export type ReleaseNoteStatusFilter = 'draft' | 'published' | 'all';

export interface CreateReleaseNoteParams {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audiencePlans: string[] | null;
  publishedAt: Date | null;
  createdBy: string | null;
}

export interface UpdateReleaseNoteParams {
  title?: string;
  body?: string;
  imageUrl?: string | null;
  audiencePlans?: string[] | null;
}

export interface AdminListItem extends ReleaseNote {
  createdByName: string | null;
}

export interface AdminListFilter {
  status: ReleaseNoteStatusFilter;
  limit: number;
  offset: number;
}

export interface AdminListResult {
  items: AdminListItem[];
  total: number;
}

export interface UnseenNoteItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: Date;
}

export interface IReleaseNoteRepository {
  /** Persists a new release note (draft). */
  create(params: CreateReleaseNoteParams): Promise<ReleaseNote>;

  /** Returns a release note by ID, or null. */
  findById(id: string): Promise<ReleaseNote | null>;

  /**
   * Returns an admin list with optional status filter and createdByName joined.
   * Draft notes are ordered by updatedAt DESC; published by publishedAt DESC.
   */
  adminList(filter: AdminListFilter): Promise<AdminListResult>;

  /** Updates editable fields on a release note. */
  update(id: string, params: UpdateReleaseNoteParams): Promise<ReleaseNote>;

  /** Sets publishedAt to the given date. */
  publish(id: string, publishedAt: Date): Promise<ReleaseNote>;

  /** Sets publishedAt to NULL (back to draft). */
  unpublish(id: string): Promise<ReleaseNote>;

  /** Deletes a release note (only call after verifying it's a draft). */
  delete(id: string): Promise<void>;

  /**
   * Returns published notes the doctor hasn't seen yet.
   *
   * Conditions (evaluated in DB, plan fetched via JOIN on profiles):
   *   - published_at IS NOT NULL
   *   - audience_plans IS NULL OR p.plan = ANY(audience_plans)
   *   - published_at > GREATEST(COALESCE(release_notes_seen_at, '-infinity'), profiles.created_at)
   *
   * Ordered by publishedAt DESC, limit 5.
   *
   * NOTE: `p.plan = ANY(rn.audience_plans)` is valid because audience_plans is a
   * TEXT[] COLUMN and p.plan is a scalar — this is different from the forbidden
   * `= ANY(:ids)` anti-pattern which binds a JS array. The scalar-vs-array-column
   * form is safe in both real Postgres and the Sequelize mock.
   */
  findUnseenForDoctor(doctorId: string): Promise<UnseenNoteItem[]>;

  /**
   * Returns all published notes for the doctor's plan (history view).
   * Plan is read from the doctor's profiles row via JOIN.
   * Ordered by publishedAt DESC, limit 50.
   */
  findPublishedForDoctor(doctorId: string): Promise<UnseenNoteItem[]>;

  /**
   * Sets profiles.release_notes_seen_at = seenAt for the given doctor.
   */
  markSeen(doctorId: string, seenAt: Date): Promise<void>;

  /** Returns all existing plan_key values from plan_configs. */
  findAllPlanKeys(): Promise<string[]>;
}
