import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanFeatureRow,
} from '../../../domain/repositories/admin.repository';

export interface GetPlanFeaturesInput {
  planKey?: string;
}

/**
 * Returns all plan features, optionally filtered by plan key.
 */
@Injectable()
export class GetPlanFeaturesUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetPlanFeaturesInput): Promise<PlanFeatureRow[]> {
    return this.adminRepo.listPlanFeatures(input.planKey);
  }
}
