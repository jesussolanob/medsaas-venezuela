import { RecordInviteClickUseCase } from './record-invite-click.use-case';
import { DispatchMeetingInvitesUseCase, PROMPT_KEY_PRE } from './dispatch-meeting-invites.use-case';
import type { IRetentionInviteRepository } from '../../domain/repositories/iretention-invite.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeRepo(
  overrides: Partial<IRetentionInviteRepository> = {},
): jest.Mocked<IRetentionInviteRepository> {
  return {
    mergePromptMetadata: jest.fn().mockResolvedValue(undefined),
    findPreWindowCandidates: jest.fn().mockResolvedValue([]),
    findExpiredWindowCandidates: jest.fn().mockResolvedValue([]),
    hasExistingPrompt: jest.fn().mockResolvedValue(false),
    hasMeetingScheduledOrDone: jest.fn().mockResolvedValue(false),
    hasGraceMonth: jest.fn().mockResolvedValue(false),
    hasReceivedLifecycleEmailToday: jest.fn().mockResolvedValue(false),
    isMeetingModalDismissed: jest.fn().mockResolvedValue(false),
    upsertEmailPrompt: jest.fn().mockResolvedValue(undefined),
    getTeamMeeting: jest.fn().mockResolvedValue(null),
    getSubscriptionSnapshot: jest.fn().mockResolvedValue(null),
    applyGraceMonth: jest.fn().mockResolvedValue(undefined),
    getRetentionMetrics: jest.fn().mockResolvedValue({} as unknown),
    ...overrides,
  } as jest.Mocked<IRetentionInviteRepository>;
}

const SECRET = 'test-secret-for-click';
const DOCTOR_ID = '11111111-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-30T14:00:00Z');

function makeConfig(secret = SECRET): jest.Mocked<ConfigService> {
  const m = { get: jest.fn() } as unknown as jest.Mocked<ConfigService>;
  m.get.mockReturnValue(secret);
  return m;
}

function buildToken(doctorId: string, promptKey: string, now: Date, secret: string): string {
  const mockConfig = makeConfig(secret);
  const mockMailer = { sendTemplate: jest.fn() } as unknown as MailerService;
  const mockRepo = makeRepo();
  const dispatchUc = new DispatchMeetingInvitesUseCase(mockRepo, mockMailer, mockConfig);
  return dispatchUc.buildToken(doctorId, promptKey, now);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecordInviteClickUseCase', () => {
  it('records the click for a valid token', async () => {
    const token = buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW, SECRET);
    const repo = makeRepo();
    const uc = new RecordInviteClickUseCase(repo, makeConfig());
    await uc.execute({ token }, NOW);
    expect(repo.mergePromptMetadata).toHaveBeenCalledWith(DOCTOR_ID, PROMPT_KEY_PRE, {
      clickedAt: NOW.toISOString(),
    });
  });

  it('does nothing for an invalid token (no oracle)', async () => {
    const repo = makeRepo();
    const uc = new RecordInviteClickUseCase(repo, makeConfig());
    await uc.execute({ token: 'not.valid' }, NOW);
    expect(repo.mergePromptMetadata).not.toHaveBeenCalled();
  });

  it('does nothing for an expired token', async () => {
    // build token that expired 50 days ago
    const pastNow = new Date(NOW.getTime() - 50 * 24 * 60 * 60 * 1000);
    const token = buildToken(DOCTOR_ID, PROMPT_KEY_PRE, pastNow, SECRET);
    const repo = makeRepo();
    const uc = new RecordInviteClickUseCase(repo, makeConfig());
    await uc.execute({ token }, NOW);
    expect(repo.mergePromptMetadata).not.toHaveBeenCalled();
  });

  it('does nothing for a tampered token', async () => {
    const token = buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW, SECRET);
    const tampered = token.slice(0, -3) + 'xxx';
    const repo = makeRepo();
    const uc = new RecordInviteClickUseCase(repo, makeConfig());
    await uc.execute({ token: tampered }, NOW);
    expect(repo.mergePromptMetadata).not.toHaveBeenCalled();
  });

  it('swallows repo errors gracefully (never throws)', async () => {
    const token = buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW, SECRET);
    const repo = makeRepo({
      mergePromptMetadata: jest.fn().mockRejectedValue(new Error('DB down')),
    });
    const uc = new RecordInviteClickUseCase(repo, makeConfig());
    await expect(uc.execute({ token }, NOW)).resolves.toBeUndefined();
  });

  it('returns silently without recording when AUTH_RESOLVE_SECRET is not configured', async () => {
    // Fail-closed: a missing secret means we cannot verify the HMAC.
    // Return silently (still 204) — never record, never reveal an oracle.
    const token = buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW, SECRET);
    const repo = makeRepo();
    const configNoSecret = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;
    const uc = new RecordInviteClickUseCase(repo, configNoSecret);
    await expect(uc.execute({ token }, NOW)).resolves.toBeUndefined();
    expect(repo.mergePromptMetadata).not.toHaveBeenCalled();
  });
});
