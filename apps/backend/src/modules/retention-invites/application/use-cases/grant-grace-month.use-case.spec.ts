import { GrantGraceMonthUseCase, addMonthsClamped } from './grant-grace-month.use-case';
import { GraceMonthAlreadyGrantedError } from '../../domain/errors/grace-month-already-granted.error';
import { GraceMonthMeetingNotDoneError } from '../../domain/errors/grace-month-meeting-not-done.error';
import { GraceMonthMeetingNotFoundError } from '../../domain/errors/grace-month-meeting-not-found.error';
import type { IRetentionInviteRepository } from '../../domain/repositories/iretention-invite.repository';

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
    getRetentionMetrics: jest.fn().mockResolvedValue({} as unknown),
    ...overrides,
  } as jest.Mocked<IRetentionInviteRepository>;
}

const MEETING_ID = 'aaaa0000-0000-0000-0000-000000000001';
const DOCTOR_ID = 'bbbb0000-0000-0000-0000-000000000002';
const ACTOR_ID = 'cccc0000-0000-0000-0000-000000000003';
const NOW = new Date('2026-11-01T12:00:00Z');

// ---------------------------------------------------------------------------
// addMonthsClamped
// ---------------------------------------------------------------------------

describe('addMonthsClamped', () => {
  // Implementation uses UTC methods internally; test assertions use getUTC* to
  // avoid timezone-dependent failures (e.g. UTC-4/America/Caracas env).
  it('adds exactly 1 month to a mid-month date', () => {
    const result = addMonthsClamped(new Date('2026-10-15'), 1);
    expect(result.getUTCMonth()).toBe(10); // November
    expect(result.getUTCDate()).toBe(15);
  });

  it('clamps Jan 31 + 1 month to Feb 28 (non-leap)', () => {
    const result = addMonthsClamped(new Date('2027-01-31'), 1);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(28);
  });

  it('clamps Jan 31 + 1 month to Feb 29 (leap year)', () => {
    const result = addMonthsClamped(new Date('2028-01-31'), 1);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(29);
  });
});

// ---------------------------------------------------------------------------
// GrantGraceMonthUseCase
// ---------------------------------------------------------------------------

describe('GrantGraceMonthUseCase', () => {
  it('throws GraceMonthMeetingNotFoundError when meeting does not exist', async () => {
    const repo = makeRepo({ getTeamMeeting: jest.fn().mockResolvedValue(null) });
    const uc = new GrantGraceMonthUseCase(repo);
    await expect(uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW)).rejects.toThrow(
      GraceMonthMeetingNotFoundError,
    );
  });

  it('throws GraceMonthMeetingNotDoneError when status is not done', async () => {
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'scheduled' }),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    await expect(uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW)).rejects.toThrow(
      GraceMonthMeetingNotDoneError,
    );
  });

  it('throws GraceMonthAlreadyGrantedError when doctor already has grace', async () => {
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'done' }),
      hasGraceMonth: jest.fn().mockResolvedValue(true),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    await expect(uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW)).rejects.toThrow(
      GraceMonthAlreadyGrantedError,
    );
  });

  // -----------------------------------------------------------------------
  // free_trial + trialing: active (expiry in future)
  // -----------------------------------------------------------------------

  it('extends free_trial (active) from current expiry + 1 month', async () => {
    const futureExpiry = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days left
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'done' }),
      getSubscriptionSnapshot: jest.fn().mockResolvedValue({
        doctorId: DOCTOR_ID,
        plan: 'free_trial',
        status: 'trialing',
        expiresAt: futureExpiry,
      }),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    const result = await uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW);
    const expected = addMonthsClamped(futureExpiry, 1);
    expect(result.newExpiresAt.getTime()).toBe(expected.getTime());
    expect(repo.applyGraceMonth).toHaveBeenCalledWith(
      expect.objectContaining({ newPlan: 'free_trial', newStatus: 'trialing' }),
    );
  });

  // -----------------------------------------------------------------------
  // free_trial + past_due: expired (from now)
  // -----------------------------------------------------------------------

  it('extends free_trial (expired) from NOW + 1 month', async () => {
    const pastExpiry = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'done' }),
      getSubscriptionSnapshot: jest.fn().mockResolvedValue({
        doctorId: DOCTOR_ID,
        plan: 'free_trial',
        status: 'past_due',
        expiresAt: pastExpiry,
      }),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    const result = await uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW);
    const expected = addMonthsClamped(NOW, 1);
    expect(result.newExpiresAt.getTime()).toBe(expected.getTime());
    expect(repo.applyGraceMonth).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'trialing', newPlan: 'free_trial' }),
    );
  });

  // -----------------------------------------------------------------------
  // Paid plan: + 30 days
  // -----------------------------------------------------------------------

  it('adds 30 days for paid plan (delta_base + active)', async () => {
    const futureExpiry = new Date(NOW.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'done' }),
      getSubscriptionSnapshot: jest.fn().mockResolvedValue({
        doctorId: DOCTOR_ID,
        plan: 'delta_base',
        status: 'active',
        expiresAt: futureExpiry,
      }),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    const result = await uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW);
    const expected = new Date(futureExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(result.newExpiresAt.getTime()).toBe(expected.getTime());
    expect(repo.applyGraceMonth).toHaveBeenCalledWith(
      expect.objectContaining({ newPlan: 'delta_base', newStatus: 'active' }),
    );
  });

  it('adds 30 days from now for expired paid plan', async () => {
    const pastExpiry = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'done' }),
      getSubscriptionSnapshot: jest.fn().mockResolvedValue({
        doctorId: DOCTOR_ID,
        plan: 'delta_plus',
        status: 'past_due',
        expiresAt: pastExpiry,
      }),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    const result = await uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW);
    const expected = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(result.newExpiresAt.getTime()).toBe(expected.getTime());
  });

  it('updates both profiles and subscriptions (applyGraceMonth called once)', async () => {
    const repo = makeRepo({
      getTeamMeeting: jest
        .fn()
        .mockResolvedValue({ id: MEETING_ID, doctorId: DOCTOR_ID, status: 'done' }),
      getSubscriptionSnapshot: jest.fn().mockResolvedValue({
        doctorId: DOCTOR_ID,
        plan: 'free_trial',
        status: 'trialing',
        expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
      }),
    });
    const uc = new GrantGraceMonthUseCase(repo);
    await uc.execute({ meetingId: MEETING_ID, actorId: ACTOR_ID }, NOW);
    expect(repo.applyGraceMonth).toHaveBeenCalledTimes(1);
    expect(repo.applyGraceMonth).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTOR_ID, doctorId: DOCTOR_ID }),
    );
  });
});
