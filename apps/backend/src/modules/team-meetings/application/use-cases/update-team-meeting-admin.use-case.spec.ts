import { UpdateTeamMeetingAdminUseCase } from './update-team-meeting-admin.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';
import { TeamMeeting } from '../../domain/entities/team-meeting.entity';
import { TeamMeetingNotFoundError } from '../../domain/errors/team-meeting-not-found.error';

const CARACAS_OFFSET = '-04:00';

function makeMeeting(
  overrides: Partial<{ status: string; notes: string | null }> = {},
): TeamMeeting {
  return TeamMeeting.create({
    id: 'meeting-uuid-0001-0000-0000-000000000001',
    doctorId: 'doctor-uuid-0001-0000-0000-000000000001',
    startsAt: new Date(`2026-11-10T10:00:00.000${CARACAS_OFFSET}`),
    endsAt: new Date(`2026-11-10T10:30:00.000${CARACAS_OFFSET}`),
    status: (overrides.status ?? 'scheduled') as TeamMeeting['status'],
    meetingUrl: 'https://meet.jit.si/delta-test',
    externalEventId: null,
    availabilityBlockId: 'block-uuid-0001-0000-0000-000000000001',
    source: 'modal',
    notes: overrides.notes ?? null,
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('UpdateTeamMeetingAdminUseCase', () => {
  let useCase: UpdateTeamMeetingAdminUseCase;
  let repo: jest.Mocked<ITeamMeetingRepository>;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findScheduledByDoctor: jest.fn(),
      listWithDoctor: jest.fn(),
      getActiveOfficeSchedules: jest.fn(),
      getAppointmentsInRange: jest.fn(),
      getAvailabilityBlocksInRange: jest.fn(),
      findAllSuperAdmins: jest.fn(),
      getSettings: jest.fn(),
      updateSetting: jest.fn(),
      getDoctorProfile: jest.fn(),
      findMeetingsNeedingReminder: jest.fn(),
      markReminder24hSent: jest.fn(),
      markReminder1hSent: jest.fn(),
    } as jest.Mocked<ITeamMeetingRepository>;

    useCase = new UpdateTeamMeetingAdminUseCase(repo);
  });

  it('throws TeamMeetingNotFoundError when meeting does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ meetingId: 'missing-uuid', status: 'done' })).rejects.toThrow(
      TeamMeetingNotFoundError,
    );
  });

  it('updates status when meeting exists', async () => {
    const meeting = makeMeeting();
    repo.findById.mockResolvedValue(meeting);
    repo.update.mockResolvedValue(makeMeeting({ status: 'done' }));

    const result = await useCase.execute({
      meetingId: 'meeting-uuid-0001-0000-0000-000000000001',
      status: 'done',
    });

    expect(repo.update).toHaveBeenCalledWith(
      'meeting-uuid-0001-0000-0000-000000000001',
      expect.objectContaining({ status: 'done' }),
    );
    expect(result.status).toBe('done');
  });

  it('updates notes when provided', async () => {
    const meeting = makeMeeting();
    repo.findById.mockResolvedValue(meeting);
    repo.update.mockResolvedValue(makeMeeting({ notes: 'Admin note.' }));

    await useCase.execute({
      meetingId: 'meeting-uuid-0001-0000-0000-000000000001',
      notes: 'Admin note.',
    });

    expect(repo.update).toHaveBeenCalledWith(
      'meeting-uuid-0001-0000-0000-000000000001',
      expect.objectContaining({ notes: 'Admin note.' }),
    );
  });

  it('clears notes when notes is null', async () => {
    const meeting = makeMeeting({ notes: 'Old note.' });
    repo.findById.mockResolvedValue(meeting);
    repo.update.mockResolvedValue(makeMeeting({ notes: null }));

    await useCase.execute({
      meetingId: 'meeting-uuid-0001-0000-0000-000000000001',
      notes: null,
    });

    expect(repo.update).toHaveBeenCalledWith(
      'meeting-uuid-0001-0000-0000-000000000001',
      expect.objectContaining({ notes: null }),
    );
  });

  it('does not include status in update payload when not provided', async () => {
    const meeting = makeMeeting();
    repo.findById.mockResolvedValue(meeting);
    repo.update.mockResolvedValue(meeting);

    await useCase.execute({
      meetingId: 'meeting-uuid-0001-0000-0000-000000000001',
      notes: 'Only notes update.',
    });

    const callArg = repo.update.mock.calls[0]?.[1];
    expect(callArg).not.toHaveProperty('status');
    expect(callArg).toHaveProperty('notes', 'Only notes update.');
  });

  it('can update both status and notes simultaneously', async () => {
    const meeting = makeMeeting();
    repo.findById.mockResolvedValue(meeting);
    repo.update.mockResolvedValue(makeMeeting({ status: 'no_show', notes: 'No show.' }));

    await useCase.execute({
      meetingId: 'meeting-uuid-0001-0000-0000-000000000001',
      status: 'no_show',
      notes: 'No show.',
    });

    expect(repo.update).toHaveBeenCalledWith(
      'meeting-uuid-0001-0000-0000-000000000001',
      expect.objectContaining({ status: 'no_show', notes: 'No show.' }),
    );
  });
});
