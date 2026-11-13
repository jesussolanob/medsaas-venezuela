import { RecordPromptShownUseCase } from './record-prompt-shown.use-case';
import type { IDoctorPromptRepository } from '../../domain/repositories/idoctor-prompt.repository';
import { DoctorPrompt } from '../../domain/entities/doctor-prompt.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-30T12:00:00.000Z');

function makePrompt(): DoctorPrompt {
  return DoctorPrompt.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    promptKey: 'meeting_modal',
    shownCount: 1,
    firstShownAt: NOW,
    lastShownAt: NOW,
    actedAt: null,
    snoozedUntil: null,
    dismissedAt: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('RecordPromptShownUseCase', () => {
  it('calls repo.recordShown with correct args', async () => {
    const repo: jest.Mocked<IDoctorPromptRepository> = {
      findByDoctorAndKey: jest.fn(),
      recordShown: jest.fn().mockResolvedValue(makePrompt()),
      recordSnooze: jest.fn(),
      recordDismiss: jest.fn(),
      recordActed: jest.fn(),
      clearActed: jest.fn(),
      hasPhase4EmailPrompt: jest.fn(),
      hasScheduledOrDoneTeamMeeting: jest.fn(),
      hasPendingContactRequest: jest.fn(),
      getDoctorCreatedAt: jest.fn(),
      getSettings: jest.fn(),
    };

    const uc = new RecordPromptShownUseCase(repo);
    await uc.execute(DOCTOR_ID, 'meeting_modal');

    expect(repo.recordShown).toHaveBeenCalledWith(DOCTOR_ID, 'meeting_modal', expect.any(Date));
  });
});
