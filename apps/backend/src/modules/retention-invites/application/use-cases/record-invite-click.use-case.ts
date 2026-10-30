import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RETENTION_INVITE_REPOSITORY,
  type IRetentionInviteRepository,
} from '../../domain/repositories/iretention-invite.repository';
import { DispatchMeetingInvitesUseCase } from './dispatch-meeting-invites.use-case';

export interface RecordInviteClickInput {
  token: string;
}

/**
 * RecordInviteClickUseCase
 *
 * Handles the click-tracking endpoint `POST /api/public/retention/click`.
 *
 * - Verifies the HMAC token (timing-safe, constant-time).
 * - Records `metadata.clickedAt` (first click only) on the email prompt row.
 * - Returns 204 even for invalid/expired tokens — never reveals oracle.
 * - Never logs the raw token value (security).
 *
 * SECURITY:
 *   - The token is signed with HMAC-SHA256(AUTH_RESOLVE_SECRET, 'retention-link-v1').
 *   - No session is created; the caller (frontend /r/meeting route) handles the redirect.
 */
@Injectable()
export class RecordInviteClickUseCase {
  private readonly logger = new Logger(RecordInviteClickUseCase.name);

  constructor(
    @Inject(RETENTION_INVITE_REPOSITORY)
    private readonly repo: IRetentionInviteRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(input: RecordInviteClickInput, nowOverride?: Date): Promise<void> {
    const now = nowOverride ?? new Date();
    const secret = this.config.get<string>('AUTH_RESOLVE_SECRET') ?? '';

    const payload = DispatchMeetingInvitesUseCase.verifyToken(input.token, secret, now);
    if (!payload) {
      // Invalid or expired — silently ignore (no oracle)
      return;
    }

    const { doctorId, promptKey } = payload;

    // Only record the first click to avoid repeated writes
    try {
      await this.repo.mergePromptMetadata(doctorId, promptKey, {
        clickedAt: now.toISOString(),
      });
    } catch (err: unknown) {
      // Best-effort: a click-tracking failure must never crash the endpoint
      this.logger.warn(
        `[invite-click] failed to record click for doctor=${doctorId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
