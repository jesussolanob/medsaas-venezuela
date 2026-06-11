import { Inject, Injectable } from '@nestjs/common';
import {
  GOOGLE_INTEGRATION_REPOSITORY,
  type IGoogleIntegrationRepository,
} from '../../../domain/repositories/google-integration.repository';

/**
 * DisconnectGoogleUseCase
 *
 * Removes the Google integration for the given doctor.
 * No-op if the doctor was not connected.
 */
@Injectable()
export class DisconnectGoogleUseCase {
  constructor(
    @Inject(GOOGLE_INTEGRATION_REPOSITORY)
    private readonly repo: IGoogleIntegrationRepository,
  ) {}

  async execute(doctorId: string): Promise<void> {
    await this.repo.deleteByDoctorId(doctorId);
  }
}
