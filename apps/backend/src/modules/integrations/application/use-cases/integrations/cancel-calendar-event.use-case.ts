import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../infrastructure/google/google-calendar.service';
import { GoogleNotConnectedError } from '../../../domain/errors/google-not-connected.error';

/**
 * CancelCalendarEventUseCase
 *
 * Deletes a Google Calendar event (e.g. when an appointment is cancelled).
 * Throws GoogleNotConnectedError when the doctor is not connected.
 */
@Injectable()
export class CancelCalendarEventUseCase {
  private readonly logger = new Logger(CancelCalendarEventUseCase.name);

  constructor(
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly repo: IGoogleIntegrationRepository,
    private readonly googleService: GoogleCalendarService,
  ) {}

  async execute(doctorId: string, eventId: string): Promise<void> {
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
          '[calendar] token refresh failed during cancel; treating as not connected',
        );
        throw new GoogleNotConnectedError(doctorId);
      }
    }

    await this.googleService.cancelEvent(activeIntegration.accessToken, eventId);
  }
}
