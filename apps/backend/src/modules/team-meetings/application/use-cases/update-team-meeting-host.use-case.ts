import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';

/**
 * UpdateTeamMeetingHostUseCase
 *
 * Sets the `team_meeting_host_profile_id` app_setting to the given profileId.
 * The host is the super_admin whose Google Calendar is used to create
 * team meeting events.
 */
@Injectable()
export class UpdateTeamMeetingHostUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
  ) {}

  async execute(profileId: string): Promise<void> {
    await this.repo.updateSetting('team_meeting_host_profile_id', profileId);
  }
}
