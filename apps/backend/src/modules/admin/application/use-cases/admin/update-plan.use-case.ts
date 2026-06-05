import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import type { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';

export interface UpdatePlanInput {
  planKey: string;
  name?: string;
  price?: number;
  trialDays?: number;
  sortOrder?: number;
  /** undefined = do not touch; null = clear the description; string = new value. */
  description?: string | null;
}

/**
 * Updates editable fields of a plan_config row.
 *
 * Only the explicitly provided fields are written; missing fields are left unchanged.
 * Throws PlanNotFoundError when the planKey does not match any existing plan.
 *
 * NOTE: is_active (toggle) is intentionally not part of this use case — it is
 * handled by TogglePlanUseCase to keep a clear separation of concerns.
 */
@Injectable()
export class UpdatePlanUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: UpdatePlanInput): Promise<PlanConfig> {
    const existing = await this.adminRepo.findPlanByKey(input.planKey);
    if (!existing) throw new PlanNotFoundError(input.planKey);

    return this.adminRepo.updatePlan({
      planKey: input.planKey,
      name: input.name,
      price: input.price,
      trialDays: input.trialDays,
      sortOrder: input.sortOrder,
      description: input.description,
    });
  }
}
