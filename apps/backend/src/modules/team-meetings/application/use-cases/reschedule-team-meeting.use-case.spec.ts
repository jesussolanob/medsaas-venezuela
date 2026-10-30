import { RescheduleTeamMeetingUseCase } from './reschedule-team-meeting.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';
import type { IAvailabilityBlockRepository } from '../../../availability-blocks/domain/repositories/availability-block.repository';
import type { IGoogleIntegrationRepository } from '../../../integrations/domain/repositories/google-integration.repository';
import type { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { TeamMeeting } from '../../domain/entities/team-meeting.entity';
import { TeamMeetingNotFoundError } from '../../domain/errors/team-meeting-not-found.error';
import { TeamMeetingAccessDeniedError } from '../../domain/errors/team-meeting-access-denied.error';
import { TeamMeetingTooLateError } from '../../domain/errors/team-meeting-too-late.error';

function makeMeeting(
  overrides: Partial<{ startsAt: Date; externalEventId: string | null }> = {},
): TeamMeeting {
  return TeamMeeting.create({
    id: 'meeting-1',
    doctorId: 'doctor-1',
    startsAt: overrides.startsAt ?? new Date('2026-11-10T18:00:00Z'), // 14:00 Caracas
    endsAt: new Date('2026-11-10T18:30:00Z'),
    status: 'scheduled',
    meetingUrl: 'https://meet.jit.si/delta-test',
    externalEventId: overrides.externalEventId ?? null,
    availabilityBlockId: 'block-1',
    source: 'modal',
    notes: null,
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('RescheduleTeamMeetingUseCase', () => {
  let useCase: RescheduleTeamMeetingUseCase;
  let repo: jest.Mocked<ITeamMeetingRepository>;
  let blockRepo: jest.Mocked<IAvailabilityBlockRepository>;
  let googleIntegrationRepo: jest.Mocked<IGoogleIntegrationRepository>;
  let googleCalendar: jest.Mocked<GoogleCalendarService>;
  let mailer: jest.Mocked<MailerService>;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
      getDoctorProfile: jest
        .fn()
        .mockResolvedValue({
          name: 'Dr. Test',
          email: 'dr@test.com',
          phone: null,
          specialty: null,
        }),
      getSettings: jest
        .fn()
        .mockResolvedValue([{ key: 'team_meeting_host_profile_id', value: '' }]),
      getAppointmentsInRange: jest.fn().mockResolvedValue([]),
      getAvailabilityBlocksInRange: jest.fn().mockResolvedValue([]),
      findScheduledByDoctor: jest.fn(),
      create: jest.fn(),
      listWithDoctor: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      updateSetting: jest.fn(),
      getActiveOfficeSchedules: jest.fn(),
      findMeetingsNeedingReminder: jest.fn(),
      markReminder24hSent: jest.fn(),
      markReminder1hSent: jest.fn(),
    } as unknown as jest.Mocked<ITeamMeetingRepository>;

    blockRepo = {
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
      findByDoctor: jest.fn(),
      findOverlapping: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IAvailabilityBlockRepository>;

    googleIntegrationRepo = {
      findByDoctorId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      updateTokens: jest.fn(),
      deleteByDoctorId: jest.fn(),
    } as unknown as jest.Mocked<IGoogleIntegrationRepository>;

    googleCalendar = {
      isConfigured: jest.fn().mockReturnValue(false),
      updateEventTime: jest.fn(),
      refreshAccessToken: jest.fn(),
      createEventWithMeet: jest.fn(),
      getAuthUrl: jest.fn(),
      exchangeCode: jest.fn(),
      createEvent: jest.fn(),
      cancelEvent: jest.fn(),
    } as unknown as jest.Mocked<GoogleCalendarService>;

    mailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: 'email-1' }),
    } as unknown as jest.Mocked<MailerService>;

    useCase = new RescheduleTeamMeetingUseCase(
      repo,
      blockRepo,
      googleIntegrationRepo,
      googleCalendar,
      mailer,
    );
    // now = 2026-11-10T10:00:00Z (06:00 Caracas)
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T10:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('throws TeamMeetingNotFoundError when meeting does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ meetingId: 'x', actorId: 'doctor-1', date: '2026-11-11', time: '10:00' }),
    ).rejects.toThrow(TeamMeetingNotFoundError);
  });

  it('throws TeamMeetingAccessDeniedError when actor is not the owner', async () => {
    repo.findById.mockResolvedValue(makeMeeting());
    await expect(
      useCase.execute({
        meetingId: 'meeting-1',
        actorId: 'other-doctor',
        date: '2026-11-11',
        time: '10:00',
      }),
    ).rejects.toThrow(TeamMeetingAccessDeniedError);
  });

  it('throws TeamMeetingTooLateError when meeting is within 2h', async () => {
    // Meeting starts at 18:00Z, now is 17:00Z → only 1h away → too late
    jest.setSystemTime(new Date('2026-11-10T17:00:00Z'));
    repo.findById.mockResolvedValue(makeMeeting());
    await expect(
      useCase.execute({
        meetingId: 'meeting-1',
        actorId: 'doctor-1',
        date: '2026-11-11',
        time: '10:00',
      }),
    ).rejects.toThrow(TeamMeetingTooLateError);
  });

  it('reschedules the meeting and creates a new block', async () => {
    repo.findById.mockResolvedValue(makeMeeting());
    repo.update.mockResolvedValue(makeMeeting({ startsAt: new Date('2026-11-11T14:00:00Z') }));

    const result = await useCase.execute({
      meetingId: 'meeting-1',
      actorId: 'doctor-1',
      date: '2026-11-11',
      time: '10:00',
    });

    expect(result.id).toBe('meeting-1');
    expect(blockRepo.delete).toHaveBeenCalledWith('block-1');
    expect(blockRepo.create).toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({ availabilityBlockId: expect.any(String) }),
    );
  });
});
