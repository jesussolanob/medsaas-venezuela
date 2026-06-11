import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanFeatureRow,
} from '../../../domain/repositories/admin.repository';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';

export interface SetPlanFeaturesInput {
  planKey: string;
  features: Array<{
    featureKey: string;
    featureLabel: string;
    enabled: boolean;
  }>;
}

@Injectable()
export class SetPlanFeaturesUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: SetPlanFeaturesInput): Promise<PlanFeatureRow[]> {
    const plan = await this.adminRepo.findPlanByKey(input.planKey);
    if (!plan) throw new PlanNotFoundError(input.planKey);

    return this.adminRepo.setPlanFeatures(input.planKey, input.features);
  }
}
