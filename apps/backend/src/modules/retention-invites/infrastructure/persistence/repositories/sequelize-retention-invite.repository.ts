import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import type {
  IRetentionInviteRepository,
  InviteCandidate,
  GraceSubscriptionSnapshot,
  TeamMeetingRow,
  ApplyGraceMonthParams,
  RetentionMetrics,
} from '../../../domain/repositories/iretention-invite.repository';
import { GraceMonthAlreadyGrantedError } from '../../../domain/errors/grace-month-already-granted.error';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';
import {
  PROMPT_KEY_PRE,
  PROMPT_KEY_EXPIRED,
} from '../../../application/use-cases/dispatch-meeting-invites.use-case';

/** Caracas timezone (UTC-4). */
const CARACAS_TZ = 'America/Caracas';

/**
 * Returns true when the error is a PostgreSQL unique-constraint violation (23505).
 * Works for both raw-query SequelizeDatabaseError and SequelizeUniqueConstraintError.
 * No Sequelize import needed — we inspect the error shape at runtime.
 */
function isPostgresUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  if (e['name'] === 'SequelizeUniqueConstraintError') return true;
  const parent = e['parent'] ?? e['original'];
  if (typeof parent === 'object' && parent !== null) {
    return (parent as Record<string, unknown>)['code'] === '23505';
  }
  return false;
}

/** Lifecycle template names used for the one-per-day deduplication check. */
const LIFECYCLE_TEMPLATES = [
  'doctor_inactivity_10d',
  'doctor_inactivity_15d',
  'retention_meeting_invite',
];

// ---------------------------------------------------------------------------
// Row types for raw SQL
// ---------------------------------------------------------------------------

interface CandidateRow {
  doctor_id: string;
  email: string;
  full_name: string | null;
  expires_at: Date;
}

interface SubscriptionSnapshotRow {
  plan: string | null;
  status: string | null;
  expires_at: Date | null;
}

/**
 * SequelizeRetentionInviteRepository
 *
 * Uses raw SQL exclusively (same pattern as SequelizeDoctorInactivityRepository).
 * No model class registration — avoids Sequelize registry collisions with other
 * modules that reference `profiles`, `subscriptions`, etc.
 *
 * IMPORTANT: Sequelize is provided globally in AppModule.
 * NEVER add it to module providers.
 *
 * SECURITY:
 *   - Never log email, full_name, phone, or any PII field in this class.
 *   - Use IN (:ids) style replacements — NEVER = ANY(:ids) (Sequelize mock limitation).
 */
// Effective trial end. The plan lives in `profiles`, but trial rows created at
// signup often have `profiles.subscription_expires_at` NULL while
// `subscriptions.current_period_end` holds the real end (same COALESCE as the
// admin repository). Latest subscription row only.
const EFFECTIVE_EXPIRY_JOIN = `
  LEFT JOIN LATERAL (
    SELECT s.current_period_end
      FROM subscriptions s
     WHERE s.doctor_id = p.id
     ORDER BY s.created_at DESC
     LIMIT 1
  ) sub ON true`;
const EFFECTIVE_EXPIRY = 'COALESCE(p.subscription_expires_at, sub.current_period_end)';

@Injectable()
export class SequelizeRetentionInviteRepository implements IRetentionInviteRepository {
  constructor(private readonly sequelize: Sequelize) {}

  // ---------------------------------------------------------------------------
  // Candidate queries
  // ---------------------------------------------------------------------------

  async findPreWindowCandidates(cap: number, now: Date): Promise<InviteCandidate[]> {
    const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rows = await this.sequelize.query<CandidateRow>(
      `SELECT p.id AS doctor_id, p.email, p.full_name, ${EFFECTIVE_EXPIRY} AS expires_at
         FROM profiles p
         ${EFFECTIVE_EXPIRY_JOIN}
        WHERE p.role = 'doctor'
          AND p.is_active = true
          AND p.plan = 'free_trial'
          AND p.subscription_status IN ('trialing', 'trial')
          AND ${EFFECTIVE_EXPIRY} >= :now
          AND ${EFFECTIVE_EXPIRY} <= :windowEnd
        ORDER BY ${EFFECTIVE_EXPIRY} ASC
        LIMIT :cap`,
      {
        type: QueryTypes.SELECT,
        replacements: { now, windowEnd, cap },
      },
    );

    return rows.map(this.mapCandidate);
  }

  async findExpiredWindowCandidates(cap: number, now: Date): Promise<InviteCandidate[]> {
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.sequelize.query<CandidateRow>(
      // The downgrade to past_due is lazy (applied at login): a doctor whose trial
      // ended and who never came back is still 'trialing' — exactly who this email
      // is for. Expiry decides; status only excludes paid/suspended states.
      `SELECT p.id AS doctor_id, p.email, p.full_name, ${EFFECTIVE_EXPIRY} AS expires_at
         FROM profiles p
         ${EFFECTIVE_EXPIRY_JOIN}
        WHERE p.role = 'doctor'
          AND p.is_active = true
          AND p.plan = 'free_trial'
          AND p.subscription_status IN ('trialing', 'trial', 'past_due')
          AND ${EFFECTIVE_EXPIRY} >= :windowStart
          AND ${EFFECTIVE_EXPIRY} < :now
        ORDER BY ${EFFECTIVE_EXPIRY} DESC
        LIMIT :cap`,
      {
        type: QueryTypes.SELECT,
        replacements: { now, windowStart, cap },
      },
    );

    return rows.map(this.mapCandidate);
  }

  // ---------------------------------------------------------------------------
  // Guard checks
  // ---------------------------------------------------------------------------

  async hasExistingPrompt(doctorId: string, promptKey: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM doctor_prompts
        WHERE doctor_id = :doctorId AND prompt_key = :promptKey`,
      { type: QueryTypes.SELECT, replacements: { doctorId, promptKey } },
    );
    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  async hasMeetingScheduledOrDone(doctorId: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM team_meetings
        WHERE doctor_id = :doctorId AND status IN ('scheduled', 'done')`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );
    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  async hasGraceMonth(doctorId: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM subscription_changes_log
        WHERE doctor_id = :doctorId AND action = 'grace_month'`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );
    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  async hasReceivedLifecycleEmailToday(doctorId: string, caracasDateStr: string): Promise<boolean> {
    // Uses the index email_send_log_recipient_created_idx (recipient_id + created_at)
    // template_name IN () is safe with positional params via raw SQL
    // :tz is bound as a replacement to avoid string interpolation in SQL
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM email_send_log
        WHERE recipient_id = :doctorId
          AND template_name IN ('doctor_inactivity_10d', 'doctor_inactivity_15d', 'retention_meeting_invite')
          AND DATE(created_at AT TIME ZONE :tz) = :caracasDate::date
          AND status = 'sent'`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId, caracasDate: caracasDateStr, tz: CARACAS_TZ },
      },
    );
    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  async isMeetingModalDismissed(doctorId: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM doctor_prompts
        WHERE doctor_id = :doctorId AND prompt_key = 'meeting_modal' AND dismissed_at IS NOT NULL`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );
    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  // ---------------------------------------------------------------------------
  // Prompt management
  // ---------------------------------------------------------------------------

  async upsertEmailPrompt(
    doctorId: string,
    promptKey: string,
    metadata: Record<string, unknown>,
    now: Date,
  ): Promise<void> {
    await this.sequelize.query(
      `INSERT INTO doctor_prompts
         (id, doctor_id, prompt_key, shown_count, first_shown_at, last_shown_at, metadata, created_at, updated_at)
       VALUES
         (:id, :doctorId, :promptKey, 1, :now, :now, CAST(:metadata AS jsonb), :now, :now)
       ON CONFLICT (doctor_id, prompt_key) DO NOTHING`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          id: randomUUID(),
          doctorId,
          promptKey,
          now,
          metadata: JSON.stringify(metadata),
        },
      },
    );
  }

  async mergePromptMetadata(
    doctorId: string,
    promptKey: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Only record the first click (clickedAt) — don't overwrite if already set
    // Uses jsonb || to merge without overwriting existing keys
    await this.sequelize.query(
      `UPDATE doctor_prompts
          SET metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:extra AS jsonb),
              updated_at = NOW()
        WHERE doctor_id = :doctorId
          AND prompt_key = :promptKey
          AND (metadata IS NULL OR metadata->>'clickedAt' IS NULL)`,
      {
        type: QueryTypes.UPDATE,
        replacements: { doctorId, promptKey, extra: JSON.stringify(metadata) },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Grace month
  // ---------------------------------------------------------------------------

  async getTeamMeeting(id: string): Promise<TeamMeetingRow | null> {
    const rows = await this.sequelize.query<TeamMeetingRow>(
      `SELECT id, doctor_id AS "doctorId", status FROM team_meetings WHERE id = :id`,
      { type: QueryTypes.SELECT, replacements: { id } },
    );
    return rows[0] ?? null;
  }

  async getSubscriptionSnapshot(doctorId: string): Promise<GraceSubscriptionSnapshot | null> {
    const rows = await this.sequelize.query<SubscriptionSnapshotRow>(
      `SELECT p.plan, p.subscription_status AS status, ${EFFECTIVE_EXPIRY} AS expires_at
         FROM profiles p
         ${EFFECTIVE_EXPIRY_JOIN}
        WHERE p.id = :doctorId`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );
    const row = rows[0];
    if (!row) return null;
    return {
      doctorId,
      plan: (row.plan ?? null) as SubscriptionPlan | null,
      status: (row.status ?? null) as SubscriptionStatus | null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    };
  }

  async applyGraceMonth(params: ApplyGraceMonthParams): Promise<void> {
    const t = await this.sequelize.transaction();
    const now = new Date();
    try {
      // 1. INSERT subscription_changes_log FIRST — the partial unique index
      //    ON subscription_changes_log (doctor_id) WHERE action = 'grace_month'
      //    guarantees that a second concurrent request fails here (23505) before
      //    any subscription/profile data is written.  See grace race discussion.
      await this.sequelize.query(
        `INSERT INTO subscription_changes_log
           (id, doctor_id, action, actor_id, actor_role, reason, subscription_expires_at, metadata, created_at)
         VALUES
           (uuid_generate_v4(), :doctorId, 'grace_month', :actorId, 'super_admin',
            'Mes de gracia por reunión de feedback',
            :expiresAt, '{"source":"team_meeting"}'::jsonb, :now)`,
        {
          type: QueryTypes.INSERT,
          replacements: {
            doctorId: params.doctorId,
            actorId: params.actorId,
            expiresAt: params.newExpiresAt,
            now,
          },
          transaction: t,
        },
      );

      // 2. Upsert subscriptions row
      await this.sequelize.query(
        `INSERT INTO subscriptions
           (id, doctor_id, plan, status, price_usd, current_period_start, current_period_end, created_at, updated_at)
         VALUES
           (uuid_generate_v4(), :doctorId, :plan, :status, 0, :now, :expiresAt, :now, :now)
         ON CONFLICT (doctor_id) DO UPDATE
           SET plan = :plan,
               status = :status,
               current_period_end = :expiresAt,
               updated_at = :now`,
        {
          type: QueryTypes.UPSERT,
          replacements: {
            doctorId: params.doctorId,
            plan: params.newPlan,
            status: params.newStatus,
            expiresAt: params.newExpiresAt,
            now,
          },
          transaction: t,
        },
      );

      // 3. Sync profiles snapshot (profile-first rule)
      await this.sequelize.query(
        `UPDATE profiles
            SET plan = :plan,
                subscription_status = :status,
                subscription_expires_at = :expiresAt,
                updated_at = :now
          WHERE id = :doctorId`,
        {
          type: QueryTypes.UPDATE,
          replacements: {
            doctorId: params.doctorId,
            plan: params.newPlan,
            status: params.newStatus,
            expiresAt: params.newExpiresAt,
            now,
          },
          transaction: t,
        },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      // Map PG unique-violation (23505) from the log INSERT to a domain error.
      // The second concurrent request changes nothing and returns 409.
      if (isPostgresUniqueViolation(err)) throw new GraceMonthAlreadyGrantedError();
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Retention metrics
  // ---------------------------------------------------------------------------

  async getRetentionMetrics(from: Date, to: Date): Promise<RetentionMetrics> {
    // All queries run in parallel for performance.
    const [
      invitesRow,
      clicksRow,
      meetingsSourceRow,
      meetingsStatusRow,
      graceRow,
      contactRow,
      returnedRow,
    ] = await Promise.all([
      // Invite emails sent in period (from doctor_prompts)
      this.sequelize.query<{ key: string; cnt: string }>(
        `SELECT prompt_key AS key, COUNT(*) AS cnt
           FROM doctor_prompts
          WHERE prompt_key IN (:preKey, :expiredKey)
            AND created_at >= :from AND created_at <= :to
          GROUP BY prompt_key`,
        {
          type: QueryTypes.SELECT,
          replacements: {
            preKey: PROMPT_KEY_PRE,
            expiredKey: PROMPT_KEY_EXPIRED,
            from,
            to,
          },
        },
      ),

      // Invite clicks (metadata.clickedAt != null, updated in period)
      this.sequelize.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT doctor_id) AS cnt
           FROM doctor_prompts
          WHERE prompt_key IN (:preKey, :expiredKey)
            AND metadata->>'clickedAt' IS NOT NULL
            AND updated_at >= :from AND updated_at <= :to`,
        {
          type: QueryTypes.SELECT,
          replacements: { preKey: PROMPT_KEY_PRE, expiredKey: PROMPT_KEY_EXPIRED, from, to },
        },
      ),

      // Meetings by source (scheduled in period)
      this.sequelize.query<{ source: string; cnt: string }>(
        `SELECT source, COUNT(*) AS cnt
           FROM team_meetings
          WHERE created_at >= :from AND created_at <= :to
          GROUP BY source`,
        { type: QueryTypes.SELECT, replacements: { from, to } },
      ),

      // Meetings by outcome status (done/no_show updated in period)
      this.sequelize.query<{ status: string; cnt: string }>(
        `SELECT status, COUNT(*) AS cnt
           FROM team_meetings
          WHERE status IN ('done', 'no_show')
            AND updated_at >= :from AND updated_at <= :to
          GROUP BY status`,
        { type: QueryTypes.SELECT, replacements: { from, to } },
      ),

      // Grace months granted in period
      this.sequelize.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
           FROM subscription_changes_log
          WHERE action = 'grace_month'
            AND created_at >= :from AND created_at <= :to`,
        { type: QueryTypes.SELECT, replacements: { from, to } },
      ),

      // Contact requests by status in period
      this.sequelize.query<{ status: string; cnt: string }>(
        `SELECT status, COUNT(*) AS cnt
           FROM contact_requests
          WHERE created_at >= :from AND created_at <= :to
          GROUP BY status`,
        { type: QueryTypes.SELECT, replacements: { from, to } },
      ),

      // Doctors who signed in within 14 days after their invite was sent in the period
      this.sequelize.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT dp.doctor_id) AS cnt
           FROM doctor_prompts dp
           JOIN profiles p ON p.id = dp.doctor_id
          WHERE dp.prompt_key IN (:preKey, :expiredKey)
            AND dp.created_at >= :from AND dp.created_at <= :to
            AND p.last_sign_in_at IS NOT NULL
            AND p.last_sign_in_at >= dp.created_at
            AND p.last_sign_in_at <= dp.created_at + INTERVAL '14 days'`,
        {
          type: QueryTypes.SELECT,
          replacements: { preKey: PROMPT_KEY_PRE, expiredKey: PROMPT_KEY_EXPIRED, from, to },
        },
      ),
    ]);

    // Aggregate invite counts
    const invitePreRow = invitesRow.find((r) => r.key === PROMPT_KEY_PRE);
    const inviteExpiredRow = invitesRow.find((r) => r.key === PROMPT_KEY_EXPIRED);

    const meetingFromEmail = meetingsSourceRow.find((r) => r.source === 'email');
    const meetingFromModal = meetingsSourceRow.find((r) => r.source === 'modal');
    const doneRow = meetingsStatusRow.find((r) => r.status === 'done');
    const noShowRow = meetingsStatusRow.find((r) => r.status === 'no_show');

    const contactByStatus = Object.fromEntries(
      contactRow.map((r) => [r.status, parseInt(r.cnt, 10)]),
    );

    return {
      invitePreSent: parseInt(invitePreRow?.cnt ?? '0', 10),
      inviteExpiredSent: parseInt(inviteExpiredRow?.cnt ?? '0', 10),
      inviteClicks: parseInt(clicksRow[0]?.cnt ?? '0', 10),
      meetingsScheduledFromEmail: parseInt(meetingFromEmail?.cnt ?? '0', 10),
      meetingsScheduledFromModal: parseInt(meetingFromModal?.cnt ?? '0', 10),
      meetingsDone: parseInt(doneRow?.cnt ?? '0', 10),
      meetingsNoShow: parseInt(noShowRow?.cnt ?? '0', 10),
      graceMonthsGranted: parseInt(graceRow[0]?.cnt ?? '0', 10),
      contactRequestsPending: contactByStatus['pending'] ?? 0,
      contactRequestsContacted: contactByStatus['contacted'] ?? 0,
      contactRequestsResolved: contactByStatus['resolved'] ?? 0,
      doctorsReturned: parseInt(returnedRow[0]?.cnt ?? '0', 10),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private readonly mapCandidate = (row: CandidateRow): InviteCandidate => ({
    doctorId: row.doctor_id,
    email: row.email,
    fullName: row.full_name ?? null,
    expiresAt: new Date(row.expires_at),
  });
}

// Re-export the lifecycle template names for testing/reference
export { LIFECYCLE_TEMPLATES };
