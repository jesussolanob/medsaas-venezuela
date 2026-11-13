import { GetRetentionMetricsUseCase } from './get-retention-metrics.use-case';
import type {
  IRetentionInviteRepository,
  RetentionMetrics,
} from '../../domain/repositories/iretention-invite.repository';

const EMPTY_METRICS: RetentionMetrics = {
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
};

function makeRepo(
  metrics: RetentionMetrics = EMPTY_METRICS,
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
    getRetentionMetrics: jest.fn().mockResolvedValue(metrics),
  } as jest.Mocked<IRetentionInviteRepository>;
}

describe('GetRetentionMetricsUseCase', () => {
  it('expands from/to to whole Caracas days (to includes the whole last day)', async () => {
    const repo = makeRepo();
    const uc = new GetRetentionMetricsUseCase(repo);
    await uc.execute({ from: '2026-10-01', to: '2026-10-31' });
    expect(repo.getRetentionMetrics).toHaveBeenCalledWith(
      new Date('2026-10-01T04:00:00.000Z'),
      new Date('2026-11-01T03:59:59.999Z'),
    );
  });

  it('counts an event at 14:00 Caracas when "to" is that same day', async () => {
    const repo = makeRepo();
    const uc = new GetRetentionMetricsUseCase(repo);
    await uc.execute({ from: '2026-10-30', to: '2026-10-30' });
    const to = repo.getRetentionMetrics.mock.calls[0]?.[1];
    expect(to).toBeDefined();
    expect(new Date('2026-10-30T18:00:00.000Z') <= (to as Date)).toBe(true);
  });

  it('returns the repository data unchanged', async () => {
    const metrics: RetentionMetrics = {
      ...EMPTY_METRICS,
      invitePreSent: 5,
      inviteExpiredSent: 2,
      inviteClicks: 3,
      meetingsDone: 4,
      graceMonthsGranted: 2,
    };
    const repo = makeRepo(metrics);
    const uc = new GetRetentionMetricsUseCase(repo);
    const result = await uc.execute({ from: '2026-10-01', to: '2026-10-31' });
    expect(result).toEqual(metrics);
  });
});
