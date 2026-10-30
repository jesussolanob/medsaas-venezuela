import { Inject, Injectable } from '@nestjs/common';
import {
  RETENTION_INVITE_REPOSITORY,
  type IRetentionInviteRepository,
  type RetentionMetrics,
} from '../../domain/repositories/iretention-invite.repository';

export interface GetRetentionMetricsInput {
  /** ISO 8601 date string (YYYY-MM-DD) or datetime. */
  from: string;
  /** ISO 8601 date string (YYYY-MM-DD) or datetime. */
  to: string;
}

/**
 * GetRetentionMetricsUseCase
 *
 * Returns aggregate retention metrics for the admin dashboard.
 * Dates are interpreted as Caracas-day boundaries.
 *
 * Counts:
 *   - invitePreSent / inviteExpiredSent — doctor_prompts rows created in period
 *   - inviteClicks — doctor_prompts rows with metadata.clickedAt in period
 *   - meetingsScheduledFromEmail/Modal — team_meetings created in period by source
 *   - meetingsDone / meetingsNoShow — team_meetings with that status, updated in period
 *   - graceMonthsGranted — subscription_changes_log rows action='grace_month' in period
 *   - contactRequestsPending/Contacted/Resolved — contact_requests by status in period
 *   - doctorsReturned — doctors who signed in ≤14d after their invite was sent
 */
@Injectable()
export class GetRetentionMetricsUseCase {
  constructor(
    @Inject(RETENTION_INVITE_REPOSITORY)
    private readonly repo: IRetentionInviteRepository,
  ) {}

  async execute(input: GetRetentionMetricsInput): Promise<RetentionMetrics> {
    // `from`/`to` are Caracas calendar days (YYYY-MM-DD). `new Date('YYYY-MM-DD')`
    // is UTC midnight = 20:00 of the PREVIOUS day in Caracas, so "hasta hoy" left
    // out everything that happened today (QA, 30/10). Whole days, Caracas time.
    const from = new Date(`${input.from}T00:00:00.000${CARACAS_OFFSET}`);
    const to = new Date(`${input.to}T23:59:59.999${CARACAS_OFFSET}`);

    return this.repo.getRetentionMetrics(from, to);
  }
}

/** America/Caracas is UTC-4 with no DST (since 2016). */
const CARACAS_OFFSET = '-04:00';
