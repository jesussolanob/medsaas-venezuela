import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import type { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanConflictError } from '../../../domain/errors/plan-conflict.error';

export interface CreatePlanInput {
  planKey: string;
  name: string;
  roleKey: string;
  isPermanent: boolean;
  isActive: boolean;
  sortOrder: number;
  description?: string | null;
}

@Injectable()
export class CreatePlanUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: CreatePlanInput): Promise<PlanConfig> {
    // Enforce uniqueness — plan_key is a natural key
    const existing = await this.adminRepo.findPlanByKey(input.planKey);
    if (existing) throw new PlanConflictError(input.planKey);

    return this.adminRepo.createPlan({
      planKey: input.planKey,
      name: input.name,
      roleKey: input.roleKey,
      isPermanent: input.isPermanent,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      description: input.description ?? null,
    });
  }
}
