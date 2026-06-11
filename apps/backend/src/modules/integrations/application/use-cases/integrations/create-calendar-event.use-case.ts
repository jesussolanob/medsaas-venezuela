import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../infrastructure/google/google-calendar.service';
import { GoogleNotConnectedError } from '../../../domain/errors/google-not-connected.error';
import type { CreateCalendarEventInput, CalendarEventResult } from '../../dtos/integration.dtos';

/**
 * CreateCalendarEventUseCase
 *
 * Attempts to create a Google Calendar event with a Meet link for an online
 * appointment. If the doctor does not have a Google integration configured,
 * or the env vars are missing, throws GoogleNotConnectedError so the caller
 * can fall back to .ics + Jitsi.
 *
 * Token refresh is handled transparently:
 *   - If the access token is expired, it is refreshed before making the API call.
 *   - Updated tokens are persisted to google_integrations.
 */
@Injectable()
export class CreateCalendarEventUseCase {
  private readonly logger = new Logger(CreateCalendarEventUseCase.name);

  constructor(
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly repo: IGoogleIntegrationRepository,
    private readonly googleService: GoogleCalendarService,
  ) {}

  async execute(input: CreateCalendarEventInput): Promise<CalendarEventResult> {
    // ENV-GATE: if Google env vars are absent, skip immediately
    if (!this.googleService.isConfigured()) {
      throw new GoogleNotConnectedError(input.doctorId);
    }

    const integration = await this.repo.findByDoctorId(input.doctorId);
    if (!integration) {
      throw new GoogleNotConnectedError(input.doctorId);
    }

    // Refresh token if needed
    let activeIntegration = integration;
    if (integration.isTokenExpired()) {
      try {
        const refreshed = await this.googleService.refreshAccessToken(integration.refreshToken);
        await this.repo.updateTokens({
          doctorId: input.doctorId,
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
        // Log without PII — token refresh failure means Google is unavailable
        this.logger.warn('[calendar] token refresh failed; treating as not connected');
        throw new GoogleNotConnectedError(input.doctorId);
      }
    }

    return this.googleService.createEventWithMeet({
      accessToken: activeIntegration.accessToken,
      summary: input.summary,
      description: input.description,
      startISO: input.startISO,
      endISO: input.endISO,
      attendeeEmail: input.attendeeEmail,
    });
  }
}
