import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import { TeamMeetingInvalidHostError } from '../../domain/errors/team-meeting-invalid-host.error';

/**
 * UpdateTeamMeetingHostUseCase
 *
 * Sets the `team_meeting_host_profile_id` app_setting to the given profileId.
 * The host is the super_admin whose Google Calendar is used to create
 * team meeting events.
 *
 * Validates that the given profileId belongs to a super_admin profile
 * before persisting — prevents accidental mis-configuration.
 */
@Injectable()
export class UpdateTeamMeetingHostUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
  ) {}

  async execute(profileId: string): Promise<void> {
    const admins = await this.repo.findAllSuperAdmins();
    const isAdmin = admins.some((a) => a.id === profileId);
    if (!isAdmin) {
      throw new TeamMeetingInvalidHostError();
    }
    await this.repo.updateSetting('team_meeting_host_profile_id', profileId);
  }
}
