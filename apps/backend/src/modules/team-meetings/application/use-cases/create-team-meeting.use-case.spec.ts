import { CreateTeamMeetingUseCase } from './create-team-meeting.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';
import type { IAvailabilityBlockRepository } from '../../../availability-blocks/domain/repositories/availability-block.repository';
import type { IDoctorPromptRepository } from '../../../doctor-prompts/domain/repositories/idoctor-prompt.repository';
import type { IGoogleIntegrationRepository } from '../../../integrations/domain/repositories/google-integration.repository';
import type { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { TeamMeeting } from '../../domain/entities/team-meeting.entity';
import { AvailabilityBlock } from '../../../availability-blocks/domain/entities/availability-block.entity';
import { TeamMeetingAlreadyScheduledError } from '../../domain/errors/team-meeting-already-scheduled.error';
import { TeamMeetingSlotTakenError } from '../../domain/errors/team-meeting-slot-taken.error';

const CARACAS_OFFSET = '-04:00';

function caracas(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00.000${CARACAS_OFFSET}`);
}

function makeMeeting(overrides: Partial<{ startsAt: Date; id: string }> = {}): TeamMeeting {
  return TeamMeeting.create({
    id: overrides.id ?? 'meeting-1',
    doctorId: 'doctor-1',
    startsAt: overrides.startsAt ?? caracas('2026-11-10', '10:00'),
    endsAt: caracas('2026-11-10', '10:30'),
    status: 'scheduled',
    meetingUrl: 'https://meet.jit.si/delta-test',
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

describe('CreateTeamMeetingUseCase', () => {
  let useCase: CreateTeamMeetingUseCase;
  let repo: jest.Mocked<ITeamMeetingRepository>;
  let blockRepo: jest.Mocked<IAvailabilityBlockRepository>;
  let promptRepo: jest.Mocked<IDoctorPromptRepository>;
  let googleIntegrationRepo: jest.Mocked<IGoogleIntegrationRepository>;
  let googleCalendar: jest.Mocked<GoogleCalendarService>;
  let mailer: jest.Mocked<MailerService>;

  beforeEach(() => {
    repo = {
      findScheduledByDoctor: jest.fn().mockResolvedValue(null),
      getAppointmentsInRange: jest.fn().mockResolvedValue([]),
      getAvailabilityBlocksInRange: jest.fn().mockResolvedValue([]),
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
        .mockResolvedValue([{ key: 'team_meeting_host_profile_id', value: 'host-1' }]),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      listWithDoctor: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      updateSetting: jest.fn(),
      getActiveOfficeSchedules: jest.fn(),
      findMeetingsNeedingReminder: jest.fn(),
      markReminder24hSent: jest.fn(),
      markReminder1hSent: jest.fn(),
    } as unknown as jest.Mocked<ITeamMeetingRepository>;

    blockRepo = {
      create: jest.fn().mockResolvedValue(
        AvailabilityBlock.create({
          id: 'block-1',
          doctorId: 'doctor-1',
          startsAt: new Date(),
          endsAt: new Date(),
          reason: 'Reunión de equipo Delta',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findByDoctor: jest.fn(),
      findOverlapping: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IAvailabilityBlockRepository>;

    promptRepo = {
      recordActed: jest.fn().mockResolvedValue(undefined),
      clearActed: jest.fn().mockResolvedValue(undefined),
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
      createEventWithMeet: jest.fn(),
      refreshAccessToken: jest.fn(),
      getAuthUrl: jest.fn(),
      exchangeCode: jest.fn(),
      createEvent: jest.fn(),
      cancelEvent: jest.fn(),
      updateEventTime: jest.fn(),
    } as unknown as jest.Mocked<GoogleCalendarService>;

    mailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: 'email-1' }),
    } as unknown as jest.Mocked<MailerService>;

    useCase = new CreateTeamMeetingUseCase(
      repo,
      blockRepo,
      promptRepo,
      googleIntegrationRepo,
      googleCalendar,
      mailer,
    );

    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T06:00:00.000-04:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws TeamMeetingAlreadyScheduledError when doctor already has a scheduled meeting', async () => {
    repo.findScheduledByDoctor.mockResolvedValue(makeMeeting());

    await expect(
      useCase.execute({ doctorId: 'doctor-1', date: '2026-11-10', time: '10:00', source: 'modal' }),
    ).rejects.toThrow(TeamMeetingAlreadyScheduledError);
  });

  it('throws TeamMeetingSlotTakenError when slot is in the past (< 2h from now)', async () => {
    // now = 06:00 Caracas, slot at 07:00 → only 1h from now → rejected
    await expect(
      useCase.execute({ doctorId: 'doctor-1', date: '2026-11-10', time: '07:00', source: 'modal' }),
    ).rejects.toThrow(TeamMeetingSlotTakenError);
  });

  it('throws TeamMeetingSlotTakenError when slot has an existing appointment', async () => {
    repo.getAppointmentsInRange.mockResolvedValue([
      { scheduledAt: new Date('2026-11-10T14:00:00.000-04:00'), durationMinutes: 30 },
    ]);

    await expect(
      useCase.execute({ doctorId: 'doctor-1', date: '2026-11-10', time: '10:00', source: 'modal' }),
    ).rejects.toThrow(TeamMeetingSlotTakenError);
  });

  it('creates a meeting with Jitsi URL when Google is not configured', async () => {
    googleCalendar.isConfigured.mockReturnValue(false);
    repo.create.mockResolvedValue(
      makeMeeting({ startsAt: new Date('2026-11-10T14:00:00.000-04:00') }),
    );

    const result = await useCase.execute({
      doctorId: 'doctor-1',
      date: '2026-11-10',
      time: '10:00',
      source: 'modal',
    });

    expect(result.status).toBe('scheduled');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: 'doctor-1',
        status: 'scheduled',
        source: 'modal',
        availabilityBlockId: expect.any(String),
      }),
    );
  });

  it('creates an availability block for the meeting duration', async () => {
    repo.create.mockResolvedValue(makeMeeting());

    await useCase.execute({
      doctorId: 'doctor-1',
      date: '2026-11-10',
      time: '10:00',
      source: 'modal',
    });

    expect(blockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: 'doctor-1',
        reason: 'Reunión de equipo Delta',
      }),
    );
  });

  it('records acted_at on the meeting modal prompt', async () => {
    repo.create.mockResolvedValue(makeMeeting());

    await useCase.execute({
      doctorId: 'doctor-1',
      date: '2026-11-10',
      time: '10:00',
      source: 'modal',
    });

    // Flush faked process.nextTick queue (Jest 30 fakes nextTick by default)
    jest.runAllTicks();
    expect(promptRepo.recordActed).toHaveBeenCalledWith(
      'doctor-1',
      'meeting_modal',
      expect.any(Date),
    );
  });
});
