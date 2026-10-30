/**
 * Spec: AdminTeamMeetingsController — cancel routing (Issue 6)
 *
 * Verifies that PATCH with status='cancelled' is routed to
 * CancelTeamMeetingUseCase (isAdmin=true) and not to UpdateTeamMeetingAdminUseCase.
 */
import { AdminTeamMeetingsController } from './admin-team-meetings.controller';
import type { ListTeamMeetingsAdminUseCase } from '../../application/use-cases/list-team-meetings-admin.use-case';
import type { UpdateTeamMeetingAdminUseCase } from '../../application/use-cases/update-team-meeting-admin.use-case';
import type { CancelTeamMeetingUseCase } from '../../application/use-cases/cancel-team-meeting.use-case';
import type { GetTeamMeetingHostUseCase } from '../../application/use-cases/get-team-meeting-host.use-case';
import type { UpdateTeamMeetingHostUseCase } from '../../application/use-cases/update-team-meeting-host.use-case';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const mockUser: CurrentUserPayload = { sub: 'admin-1', role: 'super_admin', email: 'a@delta.com' };

function makeController() {
  const listMeetings = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<ListTeamMeetingsAdminUseCase>;
  const updateMeeting = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<UpdateTeamMeetingAdminUseCase>;
  const cancelMeeting = {
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CancelTeamMeetingUseCase>;
  const getHost = { execute: jest.fn() } as unknown as jest.Mocked<GetTeamMeetingHostUseCase>;
  const updateHost = { execute: jest.fn() } as unknown as jest.Mocked<UpdateTeamMeetingHostUseCase>;

  const controller = new AdminTeamMeetingsController(
    listMeetings,
    updateMeeting,
    cancelMeeting,
    getHost,
    updateHost,
  );
  return { controller, listMeetings, updateMeeting, cancelMeeting, getHost, updateHost };
}

describe('AdminTeamMeetingsController.update', () => {
  it('routes to CancelTeamMeetingUseCase (isAdmin=true) when status=cancelled', async () => {
    const { controller, cancelMeeting, updateMeeting } = makeController();

    const result = await controller.update('meeting-1', mockUser, { status: 'cancelled' });

    expect(cancelMeeting.execute).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      actorId: 'admin-1',
      isAdmin: true,
    });
    expect(updateMeeting.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: null });
  });

  it('routes to UpdateTeamMeetingAdminUseCase when status=done', async () => {
    const { controller, cancelMeeting, updateMeeting } = makeController();
    updateMeeting.execute.mockResolvedValue({
      id: 'meeting-1',
      status: 'done',
    } as never);

    await controller.update('meeting-1', mockUser, { status: 'done' });

    expect(updateMeeting.execute).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      status: 'done',
      notes: undefined,
    });
    expect(cancelMeeting.execute).not.toHaveBeenCalled();
  });

  it('routes to UpdateTeamMeetingAdminUseCase for notes-only update', async () => {
    const { controller, cancelMeeting, updateMeeting } = makeController();
    updateMeeting.execute.mockResolvedValue({
      id: 'meeting-1',
      notes: 'some notes',
    } as never);

    await controller.update('meeting-1', mockUser, { notes: 'some notes' });

    expect(updateMeeting.execute).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      status: undefined,
      notes: 'some notes',
    });
    expect(cancelMeeting.execute).not.toHaveBeenCalled();
  });
});
