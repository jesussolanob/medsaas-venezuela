import { CancelTeamMeetingUseCase } from './cancel-team-meeting.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';
import type { IAvailabilityBlockRepository } from '../../../availability-blocks/domain/repositories/availability-block.repository';
import type { IDoctorPromptRepository } from '../../../doctor-prompts/domain/repositories/idoctor-prompt.repository';
import type { IGoogleIntegrationRepository } from '../../../integrations/domain/repositories/google-integration.repository';
import type { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { TeamMeeting } from '../../domain/entities/team-meeting.entity';
import { TeamMeetingNotFoundError } from '../../domain/errors/team-meeting-not-found.error';
import { TeamMeetingAccessDeniedError } from '../../domain/errors/team-meeting-access-denied.error';
import { TeamMeetingTooLateError } from '../../domain/errors/team-meeting-too-late.error';

function makeMeeting(
  overrides: Partial<{
    startsAt: Date;
    status: 'scheduled' | 'done' | 'cancelled' | 'no_show';
  }> = {},
): TeamMeeting {
  return TeamMeeting.create({
    id: 'meeting-1',
    doctorId: 'doctor-1',
    startsAt: overrides.startsAt ?? new Date('2026-11-10T18:00:00Z'), // 14:00 Caracas
    endsAt: new Date('2026-11-10T18:30:00Z'),
    status: overrides.status ?? 'scheduled',
    meetingUrl: null,
    externalEventId: null,
    availabilityBlockId: 'block-1',
    source: 'modal',
    notes: null,
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('CancelTeamMeetingUseCase', () => {
  let useCase: CancelTeamMeetingUseCase;
  let repo: jest.Mocked<ITeamMeetingRepository>;
  let blockRepo: jest.Mocked<IAvailabilityBlockRepository>;
  let promptRepo: jest.Mocked<IDoctorPromptRepository>;
  let googleIntegrationRepo: jest.Mocked<IGoogleIntegrationRepository>;
  let googleCalendar: jest.Mocked<GoogleCalendarService>;
  let mailer: jest.Mocked<MailerService>;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(makeMeeting({ status: 'cancelled' })),
      getDoctorProfile: jest
        .fn()
        .mockResolvedValue({
          name: 'Dr. Test',
          email: 'dr@test.com',
          phone: null,
          specialty: null,
        }),
      getSettings: jest.fn().mockResolvedValue([]),
      findScheduledByDoctor: jest.fn(),
      create: jest.fn(),
      listWithDoctor: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      updateSetting: jest.fn(),
      getActiveOfficeSchedules: jest.fn(),
      getAppointmentsInRange: jest.fn(),
      getAvailabilityBlocksInRange: jest.fn(),
      findMeetingsNeedingReminder: jest.fn(),
      markReminder24hSent: jest.fn(),
      markReminder1hSent: jest.fn(),
    } as unknown as jest.Mocked<ITeamMeetingRepository>;

    blockRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      findByDoctor: jest.fn(),
      findOverlapping: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IAvailabilityBlockRepository>;

    promptRepo = {
      clearActed: jest.fn().mockResolvedValue(undefined),
      recordActed: jest.fn(),
      findByDoctorAndKey: jest.fn(),
      recordShown: jest.fn(),
      recordSnooze: jest.fn(),
      recordDismiss: jest.fn(),
      hasPhase4EmailPrompt: jest.fn(),
      getSettings: jest.fn(),
      getDoctorCreatedAt: jest.fn(),
      hasPendingContactRequest: jest.fn(),
      hasScheduledOrDoneTeamMeeting: jest.fn(),
    } as unknown as jest.Mocked<IDoctorPromptRepository>;

    googleIntegrationRepo = {
      findByDoctorId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      updateTokens: jest.fn(),
      deleteByDoctorId: jest.fn(),
    } as unknown as jest.Mocked<IGoogleIntegrationRepository>;

    googleCalendar = {
      isConfigured: jest.fn().mockReturnValue(false),
      cancelEvent: jest.fn(),
      refreshAccessToken: jest.fn(),
      createEventWithMeet: jest.fn(),
      getAuthUrl: jest.fn(),
      exchangeCode: jest.fn(),
      createEvent: jest.fn(),
      updateEventTime: jest.fn(),
    } as unknown as jest.Mocked<GoogleCalendarService>;

    mailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: 'email-1' }),
    } as unknown as jest.Mocked<MailerService>;

    useCase = new CancelTeamMeetingUseCase(
      repo,
      blockRepo,
      promptRepo,
      googleIntegrationRepo,
      googleCalendar,
      mailer,
    );
    // now = 2026-11-10T10:00:00Z (06:00 Caracas) — meeting at 14:00 Caracas (4h away → modifiable)
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T10:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('throws TeamMeetingNotFoundError when meeting does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ meetingId: 'x', actorId: 'doctor-1', isAdmin: false }),
    ).rejects.toThrow(TeamMeetingNotFoundError);
  });

  it('throws TeamMeetingAccessDeniedError for doctor cancelling another doctor meeting', async () => {
    repo.findById.mockResolvedValue(makeMeeting());
    await expect(
      useCase.execute({ meetingId: 'meeting-1', actorId: 'other-doctor', isAdmin: false }),
    ).rejects.toThrow(TeamMeetingAccessDeniedError);
  });

  it('throws TeamMeetingTooLateError when within 2h cutoff', async () => {
    // now = 17:00Z, meeting at 18:00Z → 1h away
    jest.setSystemTime(new Date('2026-11-10T17:00:00Z'));
    repo.findById.mockResolvedValue(makeMeeting());
    await expect(
      useCase.execute({ meetingId: 'meeting-1', actorId: 'doctor-1', isAdmin: false }),
    ).rejects.toThrow(TeamMeetingTooLateError);
  });

  it('cancels the meeting and deletes the availability block', async () => {
    repo.findById.mockResolvedValue(makeMeeting());
    await useCase.execute({ meetingId: 'meeting-1', actorId: 'doctor-1', isAdmin: false });

    expect(blockRepo.delete).toHaveBeenCalledWith('block-1');
    expect(repo.update).toHaveBeenCalledWith('meeting-1', { status: 'cancelled' });
  });

  it('admin can cancel without cutoff check', async () => {
    // now = 17:45Z — only 15 min before meeting; doctor would fail
    jest.setSystemTime(new Date('2026-11-10T17:45:00Z'));
    repo.findById.mockResolvedValue(makeMeeting());

    await expect(
      useCase.execute({ meetingId: 'meeting-1', actorId: 'admin-1', isAdmin: true }),
    ).resolves.toBeUndefined();
  });

  it('clears acted_at on the modal prompt after cancellation', async () => {
    repo.findById.mockResolvedValue(makeMeeting());
    await useCase.execute({ meetingId: 'meeting-1', actorId: 'doctor-1', isAdmin: false });

    // Flush faked process.nextTick queue (Jest 30 fakes nextTick by default)
    jest.runAllTicks();
    expect(promptRepo.clearActed).toHaveBeenCalledWith('doctor-1', 'meeting_modal');
  });
});
