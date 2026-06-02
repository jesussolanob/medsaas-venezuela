import { Inject, Injectable } from '@nestjs/common';
import type { PackageSummary } from '../../../domain/entities/patient-dashboard.entity';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
} from '../../../domain/repositories/patient-portal.repository';

export interface GetPatientPackagesInput {
  authUserId: string;
  /** When true, only active packages are returned. Defaults to false (all statuses). */
  onlyActive?: boolean;
}

/**
 * Returns the authenticated patient's packages with doctor info.
 *
 * SECURITY: authUserId comes from DevAuthGuard (user.sub). The repository
 * filters strictly by auth_user_id — no cross-patient leakage is possible.
 */
@Injectable()
export class GetPatientPackagesUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: GetPatientPackagesInput): Promise<PackageSummary[]> {
    if (input.onlyActive) {
      return this.portalRepo.findActivePackages(input.authUserId);
    }
    return this.portalRepo.listPackages(input.authUserId);
  }
}
