import { createHmac, timingSafeEqual } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RETENTION_INVITE_REPOSITORY,
  type IRetentionInviteRepository,
  type InviteCandidate,
} from '../../domain/repositories/iretention-invite.repository';
import { MailerService } from '../../../email/application/services/mailer.service';

/** Max doctors processed per cron invocation (mirrors inactivity cap). */
const DISPATCH_CAP = 200;

/** Days before expiry to send the pre-window invite. */
const PRE_WINDOW_DAYS = 7;

/** Days after expiry to still send the expired-window invite. */
const EXPIRED_WINDOW_DAYS = 30;

/** Prompt key for the pre-window invite. */
export const PROMPT_KEY_PRE = 'email:meeting_invite_pre';

/** Prompt key for the expired-window invite. */
export const PROMPT_KEY_EXPIRED = 'email:meeting_invite_expired';

/** Token TTL in seconds (45 days). */
const TOKEN_TTL_SECONDS = 45 * 24 * 60 * 60;

/** Caracas timezone offset string used for date-only comparisons. */
const CARACAS_TZ = 'America/Caracas';

export interface DispatchMeetingInvitesResult {
  invitePre: number;
  inviteExpired: number;
  skipped: number;
  failed: number;
  /** Doctor IDs that received an invite this run (for inactivity deduplication). */
  invitedDoctorIds: string[];
}

/**
 * DispatchMeetingInvitesUseCase
 *
 * Sends the retention invite email to free-trial specialists:
 *   - `email:meeting_invite_pre`    → trial expires within 7 days
 *   - `email:meeting_invite_expired` → trial expired within 30 days
 *
 * Rules (binding from plan-retencion.md, section A):
 *   1. Each prompt key is sent AT MOST ONCE per doctor.
 *   2. Skip if the meeting modal was dismissed ("No me interesa").
 *   3. Skip expired invite if doctor already has a meeting scheduled/done
 *      or already received a grace month.
 *   4. Skip if the doctor already received any lifecycle email today
 *      (Caracas date) — checked via email_send_log.
 *   5. Launch mode (option A): doctors already in the windows on the first run
 *      DO receive the invite.
 *
 * SECURITY:
 *   - HMAC token derived from AUTH_RESOLVE_SECRET (already in prod).
 *     Derive key = HMAC-SHA256(AUTH_RESOLVE_SECRET, 'retention-link-v1').
 *     Token = `<base64url(payload_json)>.<base64url(hmac_hex)>` (45-day exp).
 *   - Tokens are base64url-encoded JSON; never log or expose doctorId elsewhere.
 *   - Never log email, name, or phone — only doctorId (UUID).
 */
@Injectable()
export class DispatchMeetingInvitesUseCase {
  private readonly logger = new Logger(DispatchMeetingInvitesUseCase.name);

  constructor(
    @Inject(RETENTION_INVITE_REPOSITORY)
    private readonly repo: IRetentionInviteRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(nowOverride?: Date): Promise<DispatchMeetingInvitesResult> {
    const now = nowOverride ?? new Date();
    const caracasDateStr = this.toCaracasDateStr(now);

    let invitePre = 0;
    let inviteExpired = 0;
    let skipped = 0;
    let failed = 0;
    const invitedDoctorIds: string[] = [];

    // 1. Pre-window candidates (trial ≤ 7 days)
    const preCandidates = await this.repo.findPreWindowCandidates(DISPATCH_CAP, now);
    if (preCandidates.length === DISPATCH_CAP) {
      this.logger.warn(`[invite-dispatch] pre-window cap hit (${DISPATCH_CAP}); some deferred.`);
    }

    for (const candidate of preCandidates) {
      try {
        const outcome = await this.processOne(
          candidate,
          PROMPT_KEY_PRE,
          now,
          caracasDateStr,
          false,
        );
        if (outcome === 'sent') {
          invitePre++;
          invitedDoctorIds.push(candidate.doctorId);
        } else if (outcome === 'skipped') {
          skipped++;
        } else {
          failed++;
        }
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[invite-dispatch] unhandled error for doctor=${candidate.doctorId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // 2. Expired-window candidates (past_due ≤ 30 days)
    const expiredCandidates = await this.repo.findExpiredWindowCandidates(DISPATCH_CAP, now);
    if (expiredCandidates.length === DISPATCH_CAP) {
      this.logger.warn(
        `[invite-dispatch] expired-window cap hit (${DISPATCH_CAP}); some deferred.`,
      );
    }

    for (const candidate of expiredCandidates) {
      try {
        const outcome = await this.processOne(
          candidate,
          PROMPT_KEY_EXPIRED,
          now,
          caracasDateStr,
          true,
        );
        if (outcome === 'sent') {
          inviteExpired++;
          invitedDoctorIds.push(candidate.doctorId);
        } else if (outcome === 'skipped') {
          skipped++;
        } else {
          failed++;
        }
      } catch (err: unknown) {
        failed++;
        this.logger.warn(
          `[invite-dispatch] unhandled error for doctor=${candidate.doctorId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.logger.log(
      `[invite-dispatch] pre=${invitePre} expired=${inviteExpired} ` +
        `skipped=${skipped} failed=${failed}`,
    );

    return { invitePre, inviteExpired, skipped, failed, invitedDoctorIds };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async processOne(
    candidate: InviteCandidate,
    promptKey: string,
    now: Date,
    caracasDateStr: string,
    isExpiredWindow: boolean,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    // Skip if this email invite type was already sent
    if (await this.repo.hasExistingPrompt(candidate.doctorId, promptKey)) {
      return 'skipped';
    }

    // Skip if doctor dismissed the meeting modal ("No me interesa")
    if (await this.repo.isMeetingModalDismissed(candidate.doctorId)) {
      return 'skipped';
    }

    // For expired window: skip if already scheduled/done OR already has grace
    if (isExpiredWindow) {
      if (await this.repo.hasMeetingScheduledOrDone(candidate.doctorId)) {
        return 'skipped';
      }
      if (await this.repo.hasGraceMonth(candidate.doctorId)) {
        return 'skipped';
      }
    }

    // Skip if doctor already received any lifecycle email today
    if (await this.repo.hasReceivedLifecycleEmailToday(candidate.doctorId, caracasDateStr)) {
      return 'skipped';
    }

    // Build tracking token + loginUrl
    const token = this.buildToken(candidate.doctorId, promptKey, now);
    const appBase = this.buildAppBase();
    const loginUrl = `${appBase}/r/meeting?t=${token}`;

    // Build trialStatus text
    const trialStatus = this.buildTrialStatus(candidate.expiresAt, now, isExpiredWindow);
    const doctorName = candidate.fullName ?? 'Especialista';

    try {
      await this.mailer.sendTemplate(
        'retention_meeting_invite',
        candidate.email,
        { doctorName, trialStatus, loginUrl },
        { type: 'doctor', id: candidate.doctorId },
      );

      // Record the prompt row
      await this.repo.upsertEmailPrompt(candidate.doctorId, promptKey, { loginUrl }, now);

      return 'sent';
    } catch (err: unknown) {
      this.logger.warn(
        `[invite-dispatch] mailer error for doctor=${candidate.doctorId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 'failed';
    }
  }

  // ---------------------------------------------------------------------------
  // Token helpers — exported for testing
  // ---------------------------------------------------------------------------

  /**
   * Builds a short-lived HMAC-signed invite token.
   * Key = HMAC-SHA256(AUTH_RESOLVE_SECRET, 'retention-link-v1').
   * Token = `<base64url(payload_json)>.<base64url(hmac_hex)>`.
   */
  buildToken(doctorId: string, promptKey: string, now: Date): string {
    const secret = this.config.get<string>('AUTH_RESOLVE_SECRET') ?? '';
    const derivedKey = createHmac('sha256', secret).update('retention-link-v1').digest();
    const payload = {
      d: doctorId,
      k: promptKey,
      e: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', derivedKey).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  /**
   * Verifies an invite token. Returns the payload if valid, null otherwise.
   * Uses timing-safe comparison to prevent timing oracle.
   */
  static verifyToken(
    token: string,
    secret: string,
    now: Date,
  ): { doctorId: string; promptKey: string } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payloadB64 = parts[0] as string;
    const sigB64 = parts[1] as string;

    try {
      const derivedKey = createHmac('sha256', secret).update('retention-link-v1').digest();
      const expectedSig = createHmac('sha256', derivedKey).update(payloadB64).digest('base64url');
      const expectedBuf = Buffer.from(expectedSig, 'base64url');
      const actualBuf = Buffer.from(sigB64, 'base64url');

      // Pad to same length before timing-safe compare to avoid length oracle
      if (expectedBuf.length !== actualBuf.length) return null;
      if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as unknown;
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('d' in payload) ||
        !('k' in payload) ||
        !('e' in payload)
      ) {
        return null;
      }

      const { d, k, e } = payload as { d: unknown; k: unknown; e: unknown };
      if (typeof d !== 'string' || typeof k !== 'string' || typeof e !== 'number') return null;

      // Check expiry
      if (Math.floor(now.getTime() / 1000) > e) return null;

      return { doctorId: d, promptKey: k };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private utilities
  // ---------------------------------------------------------------------------

  private buildTrialStatus(expiresAt: Date, now: Date, isExpired: boolean): string {
    if (isExpired) {
      return 'venció hace poco';
    }
    const msLeft = expiresAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (daysLeft <= 1) return 'vence mañana';
    return `vence en ${daysLeft} días`;
  }

  private buildAppBase(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      ''
    ).replace(/\/+$/, '');
  }

  /** Returns the current Caracas date as YYYY-MM-DD string. */
  private toCaracasDateStr(now: Date): string {
    return now.toLocaleDateString('en-CA', { timeZone: CARACAS_TZ });
  }

  /** Exposed for integration tests to check the pre-window day count. */
  static get preWindowDays(): number {
    return PRE_WINDOW_DAYS;
  }

  /** Exposed for integration tests to check the expired-window day count. */
  static get expiredWindowDays(): number {
    return EXPIRED_WINDOW_DAYS;
  }
}
