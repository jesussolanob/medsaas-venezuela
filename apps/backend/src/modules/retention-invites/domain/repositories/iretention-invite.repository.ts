import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

export const RETENTION_INVITE_REPOSITORY = Symbol('IRetentionInviteRepository');

// ---------------------------------------------------------------------------
// Candidate projections
// ---------------------------------------------------------------------------

/**
 * Projection used by the invite dispatch step.
 * SECURITY: Only doctorId + email + name are included — no PII beyond what the
 * mailer requires. Never log email or name fields; only log doctorId.
 */
export interface InviteCandidate {
  doctorId: string;
  email: string;
  fullName: string | null;
  /** subscription_expires_at from profiles (denormalized copy) */
  expiresAt: Date;
}

/**
 * Minimal subscription snapshot for grace-month calculation.
 */
export interface GraceSubscriptionSnapshot {
  doctorId: string;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  expiresAt: Date | null;
}

/**
 * Minimal team meeting row returned for grant-grace validation.
 */
export interface TeamMeetingRow {
  id: string;
  doctorId: string;
  status: string;
}

/**
 * Parameters for applying the grace month to a doctor's subscription.
 */
export interface ApplyGraceMonthParams {
  doctorId: string;
  actorId: string;
  newPlan: SubscriptionPlan;
  newStatus: SubscriptionStatus;
  newExpiresAt: Date;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface RetentionMetrics {
  /** invite_pre emails sent in the period */
  invitePreSent: number;
  /** invite_expired emails sent in the period */
  inviteExpiredSent: number;
  /** doctors who clicked the invite link at least once */
  inviteClicks: number;
  /** team meetings scheduled from email source in the period */
  meetingsScheduledFromEmail: number;
  /** team meetings scheduled from modal source in the period */
  meetingsScheduledFromModal: number;
  /** team meetings marked done in the period */
  meetingsDone: number;
  /** team meetings marked no_show in the period */
  meetingsNoShow: number;
  /** grace months granted in the period */
  graceMonthsGranted: number;
  /** pending contact requests created in the period */
  contactRequestsPending: number;
  /** contacted contact requests in the period */
  contactRequestsContacted: number;
  /** resolved contact requests in the period */
  contactRequestsResolved: number;
  /**
   * Doctors who logged in within 14 days of their invite being sent,
   * counted within the period. Uses profiles.last_sign_in_at.
   */
  doctorsReturned: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface IRetentionInviteRepository {
  /**
   * Returns active free_trial doctors whose subscription expires between
   * now and now + 7 days (pre window), capped at `cap`.
   * Status must be 'trialing' or 'trial'.
   */
  findPreWindowCandidates(cap: number, now: Date): Promise<InviteCandidate[]>;

  /**
   * Returns free_trial doctors whose subscription expired in the last
   * 30 days (expired window) and whose status is 'past_due', capped at `cap`.
   */
  findExpiredWindowCandidates(cap: number, now: Date): Promise<InviteCandidate[]>;

  /**
   * Returns true if the doctor already has a doctor_prompts row for this key
   * (i.e. this invite type was already sent).
   */
  hasExistingPrompt(doctorId: string, promptKey: string): Promise<boolean>;

  /**
   * Returns true if the doctor has an existing team meeting with status
   * 'scheduled' or 'done' (already took action on the invite).
   */
  hasMeetingScheduledOrDone(doctorId: string): Promise<boolean>;

  /**
   * Returns true if the doctor already received a grace month
   * (subscription_changes_log has a row with action='grace_month').
   */
  hasGraceMonth(doctorId: string): Promise<boolean>;

  /**
   * Returns true if the doctor received any lifecycle email today
   * (Caracas date) per email_send_log.
   * Lifecycle templates: doctor_inactivity_10d, doctor_inactivity_15d,
   * retention_meeting_invite.
   */
  hasReceivedLifecycleEmailToday(doctorId: string, caracasDateStr: string): Promise<boolean>;

  /**
   * Returns true if the doctor dismissed the meeting modal
   * (doctor_prompts 'meeting_modal' row has dismissed_at != null).
   */
  isMeetingModalDismissed(doctorId: string): Promise<boolean>;

  /**
   * Creates or updates the doctor_prompts row for the given key, recording
   * the prompt as "shown" (email sent). The email prompt rows use shown_count=1
   * and first_shown_at = created = now.
   * If the row already exists, this is a no-op (idempotent guard).
   */
  upsertEmailPrompt(
    doctorId: string,
    promptKey: string,
    metadata: Record<string, unknown>,
    now: Date,
  ): Promise<void>;

  /**
   * Updates the metadata of an existing doctor_prompts row by merging
   * the provided fields. Used to record invite link click timestamps.
   * If the row does not exist, does nothing.
   */
  mergePromptMetadata(
    doctorId: string,
    promptKey: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Returns the team meeting by ID, or null if not found.
   */
  getTeamMeeting(id: string): Promise<TeamMeetingRow | null>;

  /**
   * Returns the subscription snapshot for grace-month calculation.
   */
  getSubscriptionSnapshot(doctorId: string): Promise<GraceSubscriptionSnapshot | null>;

  /**
   * Applies the grace month: updates subscriptions + profiles atomically
   * and inserts a subscription_changes_log row with action='grace_month'.
   */
  applyGraceMonth(params: ApplyGraceMonthParams): Promise<void>;

  /**
   * Returns aggregate retention metrics for the given Caracas-day date range.
   */
  getRetentionMetrics(from: Date, to: Date): Promise<RetentionMetrics>;
}
