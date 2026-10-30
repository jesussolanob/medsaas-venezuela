import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../integrations/domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../integrations/infrastructure/google/google-calendar.service';

export interface GetTeamMeetingHostOutput {
  hostProfileId: string;
  googleConnected: boolean;
  googleEmail: string | null;
  googleAuthUrl: string | null;
}

/**
 * GetTeamMeetingHostUseCase
 *
 * Returns the current host configuration for team meetings:
 *   - hostProfileId from app_settings
 *   - whether Google Calendar is connected for that host
 *   - Google email if connected
 *   - Google OAuth URL to connect (when isConfigured())
 */
@Injectable()
export class GetTeamMeetingHostUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly googleIntegrationRepo: IGoogleIntegrationRepository,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async execute(): Promise<GetTeamMeetingHostOutput> {
    const settings = await this.repo.getSettings(['team_meeting_host_profile_id']);
    const hostProfileId =
      settings.find((s) => s.key === 'team_meeting_host_profile_id')?.value ?? '';

    let googleConnected = false;
    let googleEmail: string | null = null;

    if (hostProfileId) {
      const integration = await this.googleIntegrationRepo.findByDoctorId(hostProfileId);
      if (integration) {
        googleConnected = true;
        googleEmail = integration.googleEmail;
      }
    }

    const googleAuthUrl = this.googleCalendar.isConfigured()
      ? this.googleCalendar.getAuthUrl()
      : null;

    return { hostProfileId, googleConnected, googleEmail, googleAuthUrl };
  }
}
