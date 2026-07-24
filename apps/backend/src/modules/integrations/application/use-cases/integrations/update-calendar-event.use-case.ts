import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../infrastructure/google/google-calendar.service';
import { GoogleNotConnectedError } from '../../../domain/errors/google-not-connected.error';

/**
 * UpdateCalendarEventUseCase
 *
 * Moves an existing Google Calendar event to a new start/end time (e.g. when an
 * appointment is rescheduled). The Meet link, attendees, and reminders are
 * preserved (events.patch); attendees are notified of the new time.
 *
 * Mirrors CreateCalendarEventUseCase / CancelCalendarEventUseCase: it gates on
 * env config + an existing doctor integration, refreshes the access token when
 * expired (persisting the rotated tokens), then calls the calendar service.
 * Throws GoogleNotConnectedError when the doctor is not connected, so callers
 * can treat calendar sync as best-effort.
 */
@Injectable()
export class UpdateCalendarEventUseCase {
  private readonly logger = new Logger(UpdateCalendarEventUseCase.name);

  constructor(
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly repo: IGoogleIntegrationRepository,
    private readonly googleService: GoogleCalendarService,
  ) {}

  async execute(
    doctorId: string,
    eventId: string,
    startISO: string,
    endISO: string,
  ): Promise<void> {
    if (!this.googleService.isConfigured()) {
      throw new GoogleNotConnectedError(doctorId);
    }

    const integration = await this.repo.findByDoctorId(doctorId);
    if (!integration) {
      throw new GoogleNotConnectedError(doctorId);
    }

    let activeIntegration = integration;
    if (integration.isTokenExpired()) {
      try {
        const refreshed = await this.googleService.refreshAccessToken(integration.refreshToken);
        await this.repo.updateTokens({
          doctorId,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? integration.refreshToken,
          tokenExpiry: refreshed.tokenExpiry,
        });
        activeIntegration = integration.withRefreshedTokens(
          refreshed.accessToken,
          refreshed.refreshToken ?? integration.refreshToken,
          refreshed.tokenExpiry,
        );
      } catch {
        this.logger.warn(
          '[calendar] token refresh failed during reschedule; treating as not connected',
        );
        throw new GoogleNotConnectedError(doctorId);
      }
    }

    await this.googleService.updateEventTime(activeIntegration.accessToken, eventId, startISO, endISO);
  }
}
