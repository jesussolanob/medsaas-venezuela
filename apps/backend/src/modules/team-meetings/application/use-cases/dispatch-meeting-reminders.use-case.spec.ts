import { DispatchMeetingRemindersUseCase } from './dispatch-meeting-reminders.use-case';
import type {
  ITeamMeetingRepository,
  MeetingReminderRow,
} from '../../domain/repositories/iteam-meeting.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';

function makeRow(overrides: Partial<MeetingReminderRow> = {}): MeetingReminderRow {
  return {
    id: 'meeting-1',
    doctorId: 'doctor-1',
    doctorEmail: 'dr@test.com',
    doctorName: 'Dr. Test',
    startsAt: new Date('2026-11-11T14:00:00Z'),
    meetingUrl: 'https://meet.jit.si/delta-test',
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    ...overrides,
  };
}

describe('DispatchMeetingRemindersUseCase', () => {
  let useCase: DispatchMeetingRemindersUseCase;
  let repo: jest.Mocked<
    Pick<
      ITeamMeetingRepository,
      'findMeetingsNeedingReminder' | 'markReminder24hSent' | 'markReminder1hSent'
    >
  >;
  let mailer: jest.Mocked<Pick<MailerService, 'sendTemplate'>>;

  beforeEach(() => {
    repo = {
      findMeetingsNeedingReminder: jest.fn().mockResolvedValue([]),
      markReminder24hSent: jest.fn().mockResolvedValue(undefined),
      markReminder1hSent: jest.fn().mockResolvedValue(undefined),
    };

    mailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: 'email-1' }),
    };

    useCase = new DispatchMeetingRemindersUseCase(
      repo as unknown as ITeamMeetingRepository,
      mailer as unknown as MailerService,
    );
  });

  it('returns zeros when no meetings need reminders', async () => {
    const result = await useCase.execute();
    expect(result).toEqual({ reminders24hSent: 0, reminders1hSent: 0, remindersFailed: 0 });
  });

  it('sends 24h reminder for a meeting 24h away', async () => {
    const now = new Date('2026-11-10T14:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    repo.findMeetingsNeedingReminder.mockResolvedValue([makeRow()]);

    const result = await useCase.execute();

    expect(result.reminders24hSent).toBe(1);
    expect(result.reminders1hSent).toBe(0);
    expect(mailer.sendTemplate).toHaveBeenCalledWith(
      'team_meeting_reminder',
      'dr@test.com',
      expect.objectContaining({ doctorName: 'Dr. Test' }),
      { type: 'doctor', id: 'doctor-1' },
    );
    expect(repo.markReminder24hSent).toHaveBeenCalledWith('meeting-1', now);

    jest.useRealTimers();
  });

  it('sends 1h reminder for a meeting ~1h away', async () => {
    const now = new Date('2026-11-11T13:00:00Z'); // 1h before 14:00
    jest.useFakeTimers().setSystemTime(now);

    repo.findMeetingsNeedingReminder.mockResolvedValue([makeRow()]);

    const result = await useCase.execute();

    expect(result.reminders1hSent).toBe(1);
    expect(result.reminders24hSent).toBe(0);
    expect(repo.markReminder1hSent).toHaveBeenCalledWith('meeting-1', now);

    jest.useRealTimers();
  });

  it('does not re-send 24h reminder when already sent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T14:00:00Z'));
    repo.findMeetingsNeedingReminder.mockResolvedValue([
      makeRow({ reminder24hSentAt: new Date('2026-11-10T10:00:00Z') }),
    ]);

    const result = await useCase.execute();

    expect(result.reminders24hSent).toBe(0);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('counts failures without throwing', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T14:00:00Z'));
    repo.findMeetingsNeedingReminder.mockResolvedValue([makeRow()]);
    mailer.sendTemplate.mockRejectedValue(new Error('SMTP error'));

    const result = await useCase.execute();

    expect(result.remindersFailed).toBe(1);
    expect(result.reminders24hSent).toBe(0);

    jest.useRealTimers();
  });
});
