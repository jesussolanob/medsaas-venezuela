import { GetCurrentTeamMeetingUseCase } from './get-current-team-meeting.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';
import { TeamMeeting } from '../../domain/entities/team-meeting.entity';

function makeMeeting(): TeamMeeting {
  return TeamMeeting.create({
    id: 'meeting-1',
    doctorId: 'doctor-1',
    startsAt: new Date('2026-11-10T14:00:00Z'),
    endsAt: new Date('2026-11-10T14:30:00Z'),
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

describe('GetCurrentTeamMeetingUseCase', () => {
  let useCase: GetCurrentTeamMeetingUseCase;
  let repo: jest.Mocked<Pick<ITeamMeetingRepository, 'findScheduledByDoctor'>>;

  beforeEach(() => {
    repo = { findScheduledByDoctor: jest.fn() };
    useCase = new GetCurrentTeamMeetingUseCase(repo as unknown as ITeamMeetingRepository);
  });

  it('returns null when no meeting is scheduled', async () => {
    repo.findScheduledByDoctor.mockResolvedValue(null);
    const result = await useCase.execute('doctor-1');
    expect(result).toBeNull();
  });

  it('returns meeting DTO when a scheduled meeting exists', async () => {
    repo.findScheduledByDoctor.mockResolvedValue(makeMeeting());
    const result = await useCase.execute('doctor-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('meeting-1');
    expect(result?.status).toBe('scheduled');
    expect(result?.meetingUrl).toBe('https://meet.jit.si/delta-test');
  });
});
