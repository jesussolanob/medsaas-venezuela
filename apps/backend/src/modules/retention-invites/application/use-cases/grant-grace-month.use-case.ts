import { Inject, Injectable } from '@nestjs/common';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';
import {
  RETENTION_INVITE_REPOSITORY,
  type IRetentionInviteRepository,
} from '../../domain/repositories/iretention-invite.repository';
import { GraceMonthAlreadyGrantedError } from '../../domain/errors/grace-month-already-granted.error';
import { GraceMonthMeetingNotDoneError } from '../../domain/errors/grace-month-meeting-not-done.error';
import { GraceMonthMeetingNotFoundError } from '../../domain/errors/grace-month-meeting-not-found.error';

export interface GrantGraceMonthInput {
  meetingId: string;
  actorId: string;
}

export interface GrantGraceMonthOutput {
  doctorId: string;
  newExpiresAt: Date;
}

/**
 * GrantGraceMonthUseCase
 *
 * Awards a grace month to a specialist after their feedback meeting is done.
 *
 * Rules (binding from plan-retencion.md, section F):
 *   1. Meeting must exist and have status 'done'.
 *   2. Each doctor can receive at most ONE grace month (409 otherwise).
 *   3. Date math:
 *      - free_trial (trialing or past_due): keep plan=free_trial, status=trialing.
 *        If trial still active: new end = current_period_end + 1 month.
 *        If expired (past_due): new end = now + 1 month.
 *      - Paid plan (delta_base / delta_plus / active): + 30 calendar days, plan unchanged.
 *   4. Writes to BOTH subscriptions and profiles (profile-first rule).
 *   5. Inserts subscription_changes_log with action='grace_month'.
 *
 * The `action` column in subscription_changes_log is TEXT (no Postgres enum),
 * so 'grace_month' can be inserted without a schema migration.
 */
@Injectable()
export class GrantGraceMonthUseCase {
  constructor(
    @Inject(RETENTION_INVITE_REPOSITORY)
    private readonly repo: IRetentionInviteRepository,
  ) {}

  async execute(input: GrantGraceMonthInput, now?: Date): Promise<GrantGraceMonthOutput> {
    const effectiveNow = now ?? new Date();

    // 1. Load and validate the meeting
    const meeting = await this.repo.getTeamMeeting(input.meetingId);
    if (!meeting) throw new GraceMonthMeetingNotFoundError();
    if (meeting.status !== 'done') throw new GraceMonthMeetingNotDoneError();

    // 2. One grace month per doctor
    if (await this.repo.hasGraceMonth(meeting.doctorId)) {
      throw new GraceMonthAlreadyGrantedError();
    }

    // 3. Load subscription snapshot
    const snapshot = await this.repo.getSubscriptionSnapshot(meeting.doctorId);
    const plan = snapshot?.plan ?? null;
    const status = snapshot?.status ?? null;
    const currentExpiry = snapshot?.expiresAt ?? null;

    // 4. Compute new dates and final plan/status
    const isFreeTrial =
      plan === 'free_trial' || plan === 'trial' || status === 'trialing' || status === 'trial';

    let newExpiresAt: Date;
    let newPlan: SubscriptionPlan;
    let newStatus: SubscriptionStatus;

    if (isFreeTrial) {
      // Keep the plan as free_trial (or trial), restore to trialing
      newPlan = plan === 'trial' ? 'trial' : 'free_trial';
      newStatus = 'trialing';
      // If still active (expiry in the future) → extend from current expiry
      // If expired → extend from now
      const anchor = currentExpiry && currentExpiry > effectiveNow ? currentExpiry : effectiveNow;
      newExpiresAt = addMonthsClamped(anchor, 1);
    } else {
      // Paid plan: + 30 calendar days, plan/status unchanged
      newPlan = (plan ?? 'delta_base') as SubscriptionPlan;
      newStatus = (status ?? 'active') as SubscriptionStatus;
      const anchor = currentExpiry && currentExpiry > effectiveNow ? currentExpiry : effectiveNow;
      newExpiresAt = new Date(anchor.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    // 5. Apply atomically
    await this.repo.applyGraceMonth({
      doctorId: meeting.doctorId,
      actorId: input.actorId,
      newPlan,
      newStatus,
      newExpiresAt,
    });

    return { doctorId: meeting.doctorId, newExpiresAt };
  }
}

// ---------------------------------------------------------------------------
// Date math (tested independently)
// ---------------------------------------------------------------------------

/**
 * Adds `months` to `date` without overflowing into the following month.
 * Example: Jan 31 + 1 month = Feb 28 (not Mar 3).
 * This is the same helper used in ExtendDoctorSubscriptionUseCase.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  // Last day of the target month (UTC)
  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfMonth));
  return result;
}
