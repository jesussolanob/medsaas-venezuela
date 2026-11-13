import { GetMeetingPromptStatusUseCase } from './get-meeting-prompt-status.use-case';
import type { IDoctorPromptRepository } from '../../domain/repositories/idoctor-prompt.repository';
import { DoctorPrompt } from '../../domain/entities/doctor-prompt.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-30T12:00:00.000Z');

function makePrompt(
  overrides: Partial<{
    shownCount: number;
    dismissedAt: Date | null;
    snoozedUntil: Date | null;
    actedAt: Date | null;
  }>,
): DoctorPrompt {
  return DoctorPrompt.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    promptKey: 'meeting_modal',
    shownCount: overrides.shownCount ?? 0,
    firstShownAt: null,
    lastShownAt: null,
    actedAt: overrides.actedAt ?? null,
    snoozedUntil: overrides.snoozedUntil ?? null,
    dismissedAt: overrides.dismissedAt ?? null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makeRepo(
  overrides: Partial<IDoctorPromptRepository> = {},
): jest.Mocked<IDoctorPromptRepository> {
  return {
    findByDoctorAndKey: jest.fn().mockResolvedValue(null),
    recordShown: jest.fn(),
    recordSnooze: jest.fn(),
    recordDismiss: jest.fn(),
    recordActed: jest.fn(),
    clearActed: jest.fn(),
    hasPhase4EmailPrompt: jest.fn().mockResolvedValue(false),
    hasScheduledOrDoneTeamMeeting: jest.fn().mockResolvedValue(false),
    hasPendingContactRequest: jest.fn().mockResolvedValue(false),
    getDoctorCreatedAt: jest
      .fn()
      .mockResolvedValue(new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000)), // 5 days ago
    getSettings: jest.fn().mockResolvedValue([
      { key: 'meeting_prompt_enabled', value: 'true' },
      { key: 'meeting_prompt_min_days', value: '3' },
      { key: 'meeting_prompt_max_shows', value: '3' },
    ]),
    ...overrides,
  } as jest.Mocked<IDoctorPromptRepository>;
}

describe('GetMeetingPromptStatusUseCase', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns show=true for a doctor who has never seen the modal', async () => {
    const repo = makeRepo();
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(true);
    expect(result.source).toBe('modal');
  });

  it('returns show=false when kill-switch is off', async () => {
    const repo = makeRepo({
      getSettings: jest.fn().mockResolvedValue([{ key: 'meeting_prompt_enabled', value: 'false' }]),
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
    expect(result.source).toBeNull();
  });

  it('returns show=false when doctor has a scheduled/done meeting', async () => {
    const repo = makeRepo({ hasScheduledOrDoneTeamMeeting: jest.fn().mockResolvedValue(true) });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
  });

  it('returns show=false when doctor dismissed the modal', async () => {
    const repo = makeRepo({
      findByDoctorAndKey: jest.fn().mockImplementation((_, key) => {
        if (key === 'meeting_modal')
          return Promise.resolve(makePrompt({ dismissedAt: new Date(NOW.getTime() - 1000) }));
        return Promise.resolve(null);
      }),
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
  });

  it('returns show=false when doctor has a pending contact request', async () => {
    const repo = makeRepo({ hasPendingContactRequest: jest.fn().mockResolvedValue(true) });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
  });

  it('returns show=false when account younger than min_days', async () => {
    const repo = makeRepo({
      getDoctorCreatedAt: jest
        .fn()
        .mockResolvedValue(new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000)), // only 2 days ago
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
  });

  it('returns show=false when prompt is snoozed', async () => {
    const repo = makeRepo({
      findByDoctorAndKey: jest.fn().mockImplementation((_, key) => {
        if (key === 'meeting_modal')
          return Promise.resolve(
            makePrompt({
              snoozedUntil: new Date(NOW.getTime() + 12 * 60 * 60 * 1000), // snoozed for 12h
            }),
          );
        return Promise.resolve(null);
      }),
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
  });

  it('returns show=false when max shows reached and no phase-4 email', async () => {
    const repo = makeRepo({
      findByDoctorAndKey: jest.fn().mockImplementation((_, key) => {
        if (key === 'meeting_modal') return Promise.resolve(makePrompt({ shownCount: 3 }));
        return Promise.resolve(null);
      }),
      hasPhase4EmailPrompt: jest.fn().mockResolvedValue(false),
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(false);
  });

  it('returns show=true when max shows reached BUT phase-4 email row exists (bypass)', async () => {
    const repo = makeRepo({
      findByDoctorAndKey: jest.fn().mockImplementation((_, key) => {
        if (key === 'meeting_modal') return Promise.resolve(makePrompt({ shownCount: 3 }));
        if (key === 'email:meeting_invite_pre')
          return Promise.resolve(makePrompt({ shownCount: 0 }));
        return Promise.resolve(null);
      }),
      hasPhase4EmailPrompt: jest.fn().mockResolvedValue(true),
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(true);
    expect(result.source).toBe('email');
  });

  it('returns source=modal when no phase-4 email prompt', async () => {
    const repo = makeRepo();
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.source).toBe('modal');
  });

  it('handles null createdAt gracefully (does not block show)', async () => {
    const repo = makeRepo({ getDoctorCreatedAt: jest.fn().mockResolvedValue(null) });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    // No createdAt means we cannot enforce min_days — allow the show
    expect(result.show).toBe(true);
  });

  it('returns show=true when snooze has expired', async () => {
    const repo = makeRepo({
      findByDoctorAndKey: jest.fn().mockImplementation((_, key) => {
        if (key === 'meeting_modal')
          return Promise.resolve(
            makePrompt({
              snoozedUntil: new Date(NOW.getTime() - 1000), // expired 1 second ago
            }),
          );
        return Promise.resolve(null);
      }),
    });
    const uc = new GetMeetingPromptStatusUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.show).toBe(true);
  });
});
