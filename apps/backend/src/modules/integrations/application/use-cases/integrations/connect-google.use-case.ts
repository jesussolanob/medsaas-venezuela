import { Inject, Injectable } from '@nestjs/common';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../domain/repositories/google-integration.repository';
import { GoogleCalendarService } from '../../../infrastructure/google/google-calendar.service';
import { GoogleNotConnectedError } from '../../../domain/errors/google-not-connected.error';
import type { IntegrationStatusOutput } from '../../dtos/integration.dtos';

/**
 * ConnectGoogleUseCase
 *
 * Exchanges an OAuth authorization code for access + refresh tokens,
 * encrypts them, and upserts the google_integrations row for this doctor.
 *
 * Returns the integration status (connected: true, googleEmail).
 * Throws GoogleNotConnectedError when GOOGLE_CLIENT_ID/SECRET are not set.
 */
@Injectable()
export class ConnectGoogleUseCase {
  constructor(
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly repo: IGoogleIntegrationRepository,
    private readonly googleService: GoogleCalendarService,
  ) {}

  async execute(doctorId: string, code: string): Promise<IntegrationStatusOutput> {
    // ENV-GATE: if Google OAuth is not configured, return a domain error
    if (!this.googleService.isConfigured()) {
      throw new GoogleNotConnectedError(doctorId);
    }

    const tokens = await this.googleService.exchangeCode(code);

    const integration = await this.repo.upsert({
      doctorId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.tokenExpiry,
      scope: tokens.scope,
      googleEmail: tokens.googleEmail,
    });

    return {
      connected: true,
      googleEmail: integration.googleEmail ?? undefined,
    };
  }
}
