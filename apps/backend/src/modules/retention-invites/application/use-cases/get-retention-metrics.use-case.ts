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
    const from = new Date(input.from);
    const to = new Date(input.to);

    return this.repo.getRetentionMetrics(from, to);
  }
}
