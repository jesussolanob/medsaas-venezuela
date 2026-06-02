import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import type { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';

export interface TogglePlanInput {
  planKey: string;
  isActive: boolean;
}

/**
 * Activates or deactivates a SaaS plan configuration.
 *
 * Throws PlanNotFoundError when the planKey does not match any plan_configs row.
 */
@Injectable()
export class TogglePlanUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: TogglePlanInput): Promise<PlanConfig> {
    const existing = await this.adminRepo.findPlanByKey(input.planKey);
    if (!existing) throw new PlanNotFoundError(input.planKey);

    return this.adminRepo.togglePlan(input.planKey, input.isActive);
  }
}
