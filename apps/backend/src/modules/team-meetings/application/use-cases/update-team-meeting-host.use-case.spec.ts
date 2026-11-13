import { UpdateTeamMeetingHostUseCase } from './update-team-meeting-host.use-case';
import type { ITeamMeetingRepository } from '../../domain/repositories/iteam-meeting.repository';
import { TeamMeetingInvalidHostError } from '../../domain/errors/team-meeting-invalid-host.error';

type HostRepo = Pick<ITeamMeetingRepository, 'findAllSuperAdmins' | 'updateSetting'>;

function makeRepo(overrides: Partial<jest.Mocked<HostRepo>> = {}): jest.Mocked<HostRepo> {
  return {
    findAllSuperAdmins: jest.fn().mockResolvedValue([
      { id: 'admin-1', email: 'admin1@delta.com', fullName: 'Admin One' },
      { id: 'admin-2', email: 'admin2@delta.com', fullName: 'Admin Two' },
    ]),
    updateSetting: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('UpdateTeamMeetingHostUseCase', () => {
  it('saves the setting when the profileId belongs to a super_admin', async () => {
    const repo = makeRepo();
    const uc = new UpdateTeamMeetingHostUseCase(repo as unknown as ITeamMeetingRepository);

    await uc.execute('admin-1');

    expect(repo.updateSetting).toHaveBeenCalledWith('team_meeting_host_profile_id', 'admin-1');
  });

  it('throws TeamMeetingInvalidHostError (422) when profileId is not a super_admin', async () => {
    const repo = makeRepo();
    const uc = new UpdateTeamMeetingHostUseCase(repo as unknown as ITeamMeetingRepository);

    await expect(uc.execute('doctor-999')).rejects.toThrow(TeamMeetingInvalidHostError);
    expect(repo.updateSetting).not.toHaveBeenCalled();
  });

  it('throws TeamMeetingInvalidHostError when there are no super_admins at all', async () => {
    const repo = makeRepo({
      findAllSuperAdmins: jest.fn().mockResolvedValue([]),
    });
    const uc = new UpdateTeamMeetingHostUseCase(repo as unknown as ITeamMeetingRepository);

    await expect(uc.execute('any-id')).rejects.toThrow(TeamMeetingInvalidHostError);
  });

  it('accepts the second admin in the list', async () => {
    const repo = makeRepo();
    const uc = new UpdateTeamMeetingHostUseCase(repo as unknown as ITeamMeetingRepository);

    await uc.execute('admin-2');

    expect(repo.updateSetting).toHaveBeenCalledWith('team_meeting_host_profile_id', 'admin-2');
  });
});
