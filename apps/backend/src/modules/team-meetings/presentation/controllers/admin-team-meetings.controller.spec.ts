import { AdminTeamMeetingsController } from './admin-team-meetings.controller';
import type { ListTeamMeetingsAdminUseCase } from '../../application/use-cases/list-team-meetings-admin.use-case';
import type { UpdateTeamMeetingAdminUseCase } from '../../application/use-cases/update-team-meeting-admin.use-case';
import type { CancelTeamMeetingUseCase } from '../../application/use-cases/cancel-team-meeting.use-case';
import type { GetTeamMeetingHostUseCase } from '../../application/use-cases/get-team-meeting-host.use-case';
import type { UpdateTeamMeetingHostUseCase } from '../../application/use-cases/update-team-meeting-host.use-case';
import { TeamMeeting } from '../../domain/entities/team-meeting.entity';

function makeMeeting(): TeamMeeting {
  return TeamMeeting.create({
    id: 'meeting-1',
    doctorId: 'doctor-1',
    startsAt: new Date('2026-11-10T14:00:00Z'),
    endsAt: new Date('2026-11-10T14:30:00Z'),
    status: 'done',
    meetingUrl: null,
    externalEventId: null,
    availabilityBlockId: null,
    source: 'modal',
    notes: null,
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('AdminTeamMeetingsController', () => {
  let controller: AdminTeamMeetingsController;
  let listMeetings: jest.Mocked<Pick<ListTeamMeetingsAdminUseCase, 'execute'>>;
  let updateMeeting: jest.Mocked<Pick<UpdateTeamMeetingAdminUseCase, 'execute'>>;
  let cancelMeeting: jest.Mocked<Pick<CancelTeamMeetingUseCase, 'execute'>>;
  let getHost: jest.Mocked<Pick<GetTeamMeetingHostUseCase, 'execute'>>;
  let updateHost: jest.Mocked<Pick<UpdateTeamMeetingHostUseCase, 'execute'>>;

  beforeEach(() => {
    listMeetings = { execute: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    updateMeeting = { execute: jest.fn().mockResolvedValue(makeMeeting()) };
    cancelMeeting = { execute: jest.fn().mockResolvedValue(undefined) };
    getHost = {
      execute: jest.fn().mockResolvedValue({
        hostProfileId: 'host-1',
        googleConnected: false,
        googleEmail: null,
        googleAuthUrl: null,
      }),
    };
    updateHost = { execute: jest.fn().mockResolvedValue(undefined) };

    controller = new AdminTeamMeetingsController(
      listMeetings as unknown as ListTeamMeetingsAdminUseCase,
      updateMeeting as unknown as UpdateTeamMeetingAdminUseCase,
      cancelMeeting as unknown as CancelTeamMeetingUseCase,
      getHost as unknown as GetTeamMeetingHostUseCase,
      updateHost as unknown as UpdateTeamMeetingHostUseCase,
    );
  });

  it('list returns paginated response', async () => {
    const res = await controller.list({ limit: '10', offset: '0' });
    expect(res.success).toBe(true);
    expect(res.meta).toEqual(expect.objectContaining({ total: 0 }));
  });

  it('update delegates to UpdateTeamMeetingAdminUseCase', async () => {
    const res = await controller.update('meeting-uuid-1111-0000-0000-000000000000', {
      status: 'done',
    });
    expect(updateMeeting.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 'meeting-uuid-1111-0000-0000-000000000000',
        status: 'done',
      }),
    );
    expect(res.success).toBe(true);
  });

  it('host returns host configuration', async () => {
    const res = await controller.host();
    expect(res.success).toBe(true);
    expect(res.data).toEqual(expect.objectContaining({ hostProfileId: 'host-1' }));
  });

  it('setHost delegates to UpdateTeamMeetingHostUseCase', async () => {
    const res = await controller.setHost({ profileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    expect(updateHost.execute).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(res.success).toBe(true);
  });
});
