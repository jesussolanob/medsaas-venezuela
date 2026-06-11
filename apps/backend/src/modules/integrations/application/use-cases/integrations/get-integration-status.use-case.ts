import { Inject, Injectable } from '@nestjs/common';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../domain/repositories/google-integration.repository';
import type { IntegrationStatusOutput } from '../../dtos/integration.dtos';

/**
 * GetIntegrationStatusUseCase
 *
 * Returns whether the given doctor has a connected Google account.
 * NEVER exposes tokens in the output.
 */
@Injectable()
export class GetIntegrationStatusUseCase {
  constructor(
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly repo: IGoogleIntegrationRepository,
  ) {}

  async execute(doctorId: string): Promise<IntegrationStatusOutput> {
    const integration = await this.repo.findByDoctorId(doctorId);
    if (!integration) {
      return { connected: false };
    }
    return {
      connected: true,
      googleEmail: integration.googleEmail ?? undefined,
    };
  }
}
