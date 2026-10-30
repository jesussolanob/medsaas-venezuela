import { ConfigService } from '@nestjs/config';
import { DispatchMeetingInvitesUseCase, PROMPT_KEY_PRE } from './dispatch-meeting-invites.use-case';
import type { IRetentionInviteRepository } from '../../domain/repositories/iretention-invite.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeRepo(
  overrides: Partial<IRetentionInviteRepository> = {},
): jest.Mocked<IRetentionInviteRepository> {
  return {
    findPreWindowCandidates: jest.fn().mockResolvedValue([]),
    findExpiredWindowCandidates: jest.fn().mockResolvedValue([]),
    hasExistingPrompt: jest.fn().mockResolvedValue(false),
    hasMeetingScheduledOrDone: jest.fn().mockResolvedValue(false),
    hasGraceMonth: jest.fn().mockResolvedValue(false),
    hasReceivedLifecycleEmailToday: jest.fn().mockResolvedValue(false),
    isMeetingModalDismissed: jest.fn().mockResolvedValue(false),
    upsertEmailPrompt: jest.fn().mockResolvedValue(undefined),
    mergePromptMetadata: jest.fn().mockResolvedValue(undefined),
    getTeamMeeting: jest.fn().mockResolvedValue(null),
    getSubscriptionSnapshot: jest.fn().mockResolvedValue(null),
    applyGraceMonth: jest.fn().mockResolvedValue(undefined),
    getRetentionMetrics: jest.fn().mockResolvedValue({
      invitePreSent: 0,
      inviteExpiredSent: 0,
      inviteClicks: 0,
      meetingsScheduledFromEmail: 0,
      meetingsScheduledFromModal: 0,
      meetingsDone: 0,
      meetingsNoShow: 0,
      graceMonthsGranted: 0,
      contactRequestsPending: 0,
      contactRequestsContacted: 0,
      contactRequestsResolved: 0,
      doctorsReturned: 0,
    }),
    ...overrides,
  } as jest.Mocked<IRetentionInviteRepository>;
}

function makeConfig(
  appUrl = 'https://deltasalud.app',
  secret = 'test-secret-abc-xyz',
): jest.Mocked<ConfigService> {
  const m = { get: jest.fn() } as unknown as jest.Mocked<ConfigService>;
  m.get.mockImplementation((key: string) => {
    if (key === 'APP_BASE_URL') return appUrl;
    if (key === 'AUTH_RESOLVE_SECRET') return secret;
    return undefined;
  });
  return m;
}

function makeMailer(): jest.Mocked<MailerService> {
  return {
    sendTemplate: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
  } as unknown as jest.Mocked<MailerService>;
}

const DOCTOR_ID = '11111111-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-30T14:00:00Z');

// ---------------------------------------------------------------------------
// Token sign / verify
// ---------------------------------------------------------------------------

describe('DispatchMeetingInvitesUseCase — token', () => {
  const secret = 'super-secret-key';
  let useCase: DispatchMeetingInvitesUseCase;

  beforeEach(() => {
    useCase = new DispatchMeetingInvitesUseCase(
      makeRepo(),
      makeMailer(),
      makeConfig('https://app.test', secret),
    );
  });

  it('produces a two-part base64url token', () => {
    const tok = useCase.buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW);
    expect(tok.split('.')).toHaveLength(2);
  });

  it('verifies a valid token correctly', () => {
    const tok = useCase.buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW);
    const result = DispatchMeetingInvitesUseCase.verifyToken(tok, secret, NOW);
    expect(result).toEqual({ doctorId: DOCTOR_ID, promptKey: PROMPT_KEY_PRE });
  });

  it('rejects a tampered signature', () => {
    const tok = useCase.buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW);
    const tampered = tok.slice(0, -3) + 'xxx';
    expect(DispatchMeetingInvitesUseCase.verifyToken(tampered, secret, NOW)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const tok = useCase.buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW);
    const [, sig] = tok.split('.');
    const fakePayload = Buffer.from('{"d":"evil-id","k":"pre","e":9999999999}').toString(
      'base64url',
    );
    const fakeToken = `${fakePayload}.${sig}`;
    expect(DispatchMeetingInvitesUseCase.verifyToken(fakeToken, secret, NOW)).toBeNull();
  });

  it('rejects an expired token', () => {
    const pastNow = new Date(NOW.getTime() - 50 * 24 * 60 * 60 * 1000); // 50 days ago
    const tok = useCase.buildToken(DOCTOR_ID, PROMPT_KEY_PRE, pastNow);
    expect(DispatchMeetingInvitesUseCase.verifyToken(tok, secret, NOW)).toBeNull();
  });

  it('rejects a malformed token (no dot)', () => {
    expect(DispatchMeetingInvitesUseCase.verifyToken('notavalidtoken', secret, NOW)).toBeNull();
  });

  it('rejects with wrong secret', () => {
    const tok = useCase.buildToken(DOCTOR_ID, PROMPT_KEY_PRE, NOW);
    expect(DispatchMeetingInvitesUseCase.verifyToken(tok, 'wrong-secret', NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Candidate selection — pre-window
// ---------------------------------------------------------------------------

describe('DispatchMeetingInvitesUseCase — pre-window selection', () => {
  let repo: jest.Mocked<IRetentionInviteRepository>;
  let mailer: jest.Mocked<MailerService>;
  let useCase: DispatchMeetingInvitesUseCase;

  const preCandidate = {
    doctorId: DOCTOR_ID,
    email: 'doc@test.com',
    fullName: 'Dr. Test',
    expiresAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days left
  };

  beforeEach(() => {
    repo = makeRepo({
      findPreWindowCandidates: jest.fn().mockResolvedValue([preCandidate]),
    });
    mailer = makeMailer();
    useCase = new DispatchMeetingInvitesUseCase(repo, mailer, makeConfig());
  });

  it('sends pre-window invite for a valid candidate', async () => {
    const result = await useCase.execute(NOW);
    expect(result.invitePre).toBe(1);
    expect(result.inviteExpired).toBe(0);
    expect(mailer.sendTemplate).toHaveBeenCalledWith(
      'retention_meeting_invite',
      preCandidate.email,
      expect.objectContaining({ doctorName: 'Dr. Test', trialStatus: 'vence en 3 días' }),
      { type: 'doctor', id: DOCTOR_ID },
    );
    expect(repo.upsertEmailPrompt).toHaveBeenCalledWith(
      DOCTOR_ID,
      PROMPT_KEY_PRE,
      expect.any(Object),
      NOW,
    );
    expect(result.invitedDoctorIds).toContain(DOCTOR_ID);
  });

  it('uses "vence mañana" when 1 day left', async () => {
    repo.findPreWindowCandidates.mockResolvedValue([
      {
        ...preCandidate,
        expiresAt: new Date(NOW.getTime() + 18 * 60 * 60 * 1000), // 18h left
      },
    ]);
    await useCase.execute(NOW);
    expect(mailer.sendTemplate).toHaveBeenCalledWith(
      'retention_meeting_invite',
      preCandidate.email,
      expect.objectContaining({ trialStatus: 'vence mañana' }),
      expect.any(Object),
    );
  });

  it('skips if prompt already exists', async () => {
    repo.hasExistingPrompt.mockResolvedValue(true);
    const result = await useCase.execute(NOW);
    expect(result.invitePre).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips if meeting modal was dismissed', async () => {
    repo.isMeetingModalDismissed.mockResolvedValue(true);
    const result = await useCase.execute(NOW);
    expect(result.skipped).toBe(1);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips if lifecycle email already sent today', async () => {
    repo.hasReceivedLifecycleEmailToday.mockResolvedValue(true);
    const result = await useCase.execute(NOW);
    expect(result.skipped).toBe(1);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('counts as failed when mailer throws', async () => {
    mailer.sendTemplate.mockRejectedValue(new Error('SMTP down'));
    const result = await useCase.execute(NOW);
    expect(result.failed).toBe(1);
    expect(result.invitePre).toBe(0);
    expect(repo.upsertEmailPrompt).not.toHaveBeenCalled();
  });

  it('does NOT check meeting/grace for pre-window', async () => {
    await useCase.execute(NOW);
    expect(repo.hasMeetingScheduledOrDone).not.toHaveBeenCalled();
    expect(repo.hasGraceMonth).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Candidate selection — expired-window
// ---------------------------------------------------------------------------

describe('DispatchMeetingInvitesUseCase — expired-window selection', () => {
  let repo: jest.Mocked<IRetentionInviteRepository>;
  let mailer: jest.Mocked<MailerService>;
  let useCase: DispatchMeetingInvitesUseCase;

  const expiredCandidate = {
    doctorId: DOCTOR_ID,
    email: 'doc@test.com',
    fullName: 'Dra. Expired',
    expiresAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
  };

  beforeEach(() => {
    repo = makeRepo({
      findExpiredWindowCandidates: jest.fn().mockResolvedValue([expiredCandidate]),
    });
    mailer = makeMailer();
    useCase = new DispatchMeetingInvitesUseCase(repo, mailer, makeConfig());
  });

  it('sends expired invite with "venció hace poco" trialStatus', async () => {
    const result = await useCase.execute(NOW);
    expect(result.inviteExpired).toBe(1);
    expect(mailer.sendTemplate).toHaveBeenCalledWith(
      'retention_meeting_invite',
      expiredCandidate.email,
      expect.objectContaining({ trialStatus: 'venció hace poco' }),
      expect.any(Object),
    );
  });

  it('skips if doctor already has scheduled/done meeting', async () => {
    repo.hasMeetingScheduledOrDone.mockResolvedValue(true);
    const result = await useCase.execute(NOW);
    expect(result.skipped).toBe(1);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips if doctor already has grace month', async () => {
    repo.hasGraceMonth.mockResolvedValue(true);
    const result = await useCase.execute(NOW);
    expect(result.skipped).toBe(1);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips if modal dismissed', async () => {
    repo.isMeetingModalDismissed.mockResolvedValue(true);
    const result = await useCase.execute(NOW);
    expect(result.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// One-email-per-day enforcement
// ---------------------------------------------------------------------------

describe('DispatchMeetingInvitesUseCase — one-email-per-day', () => {
  it('returns invitedDoctorIds so inactivity step can skip them', async () => {
    const candidate = {
      doctorId: DOCTOR_ID,
      email: 'doc@test.com',
      fullName: 'Dr. Name',
      expiresAt: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
    };
    const repo = makeRepo({ findPreWindowCandidates: jest.fn().mockResolvedValue([candidate]) });
    const useCase = new DispatchMeetingInvitesUseCase(repo, makeMailer(), makeConfig());
    const result = await useCase.execute(NOW);
    expect(result.invitedDoctorIds).toEqual([DOCTOR_ID]);
  });

  it('includes login URL with tracking token in email data', async () => {
    const candidate = {
      doctorId: DOCTOR_ID,
      email: 'doc@test.com',
      fullName: 'Dr. Name',
      expiresAt: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
    };
    const repo = makeRepo({ findPreWindowCandidates: jest.fn().mockResolvedValue([candidate]) });
    const mailer = makeMailer();
    const useCase = new DispatchMeetingInvitesUseCase(repo, mailer, makeConfig('https://app.test'));
    await useCase.execute(NOW);

    const callArgs = (mailer.sendTemplate.mock.calls[0] as unknown[])[2] as Record<string, string>;
    expect(callArgs.loginUrl).toMatch(/^https:\/\/app\.test\/r\/meeting\?t=[\w.-]+$/);
  });
});
