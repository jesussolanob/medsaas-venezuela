import { SnoozePromptUseCase } from './snooze-prompt.use-case';
import type { IDoctorPromptRepository } from '../../domain/repositories/idoctor-prompt.repository';
import { DoctorPrompt } from '../../domain/entities/doctor-prompt.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-30T12:00:00.000Z');

function makePrompt(snoozedUntil: Date): DoctorPrompt {
  return DoctorPrompt.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    promptKey: 'meeting_modal',
    shownCount: 1,
    firstShownAt: NOW,
    lastShownAt: NOW,
    actedAt: null,
    snoozedUntil,
    dismissedAt: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('SnoozePromptUseCase', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('uses default 1-day snooze when no setting', async () => {
    const expectedSnooze = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const repo: jest.Mocked<IDoctorPromptRepository> = {
      findByDoctorAndKey: jest.fn(),
      recordShown: jest.fn(),
      recordSnooze: jest.fn().mockResolvedValue(makePrompt(expectedSnooze)),
      recordDismiss: jest.fn(),
      recordActed: jest.fn(),
      clearActed: jest.fn(),
      hasPhase4EmailPrompt: jest.fn(),
      hasScheduledOrDoneTeamMeeting: jest.fn(),
      hasPendingContactRequest: jest.fn(),
      getDoctorCreatedAt: jest.fn(),
      getSettings: jest.fn().mockResolvedValue([]),
    };

    const uc = new SnoozePromptUseCase(repo);
    await uc.execute(DOCTOR_ID, 'meeting_modal');

    expect(repo.recordSnooze).toHaveBeenCalledWith(DOCTOR_ID, 'meeting_modal', expectedSnooze, NOW);
  });

  it('uses setting value for snooze duration', async () => {
    const expectedSnooze = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days
    const repo: jest.Mocked<IDoctorPromptRepository> = {
      findByDoctorAndKey: jest.fn(),
      recordShown: jest.fn(),
      recordSnooze: jest.fn().mockResolvedValue(makePrompt(expectedSnooze)),
      recordDismiss: jest.fn(),
      recordActed: jest.fn(),
      clearActed: jest.fn(),
      hasPhase4EmailPrompt: jest.fn(),
      hasScheduledOrDoneTeamMeeting: jest.fn(),
      hasPendingContactRequest: jest.fn(),
      getDoctorCreatedAt: jest.fn(),
      getSettings: jest.fn().mockResolvedValue([{ key: 'meeting_prompt_snooze_days', value: '2' }]),
    };

    const uc = new SnoozePromptUseCase(repo);
    await uc.execute(DOCTOR_ID, 'meeting_modal');

    expect(repo.recordSnooze).toHaveBeenCalledWith(DOCTOR_ID, 'meeting_modal', expectedSnooze, NOW);
  });
});
