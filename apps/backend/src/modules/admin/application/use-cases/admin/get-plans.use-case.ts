import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import type { PlanConfig } from '../../../domain/value-objects/plan-config.vo';

/**
 * Returns the list of all SaaS plan configurations ordered by sort_order.
 */
@Injectable()
export class GetPlansUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<PlanConfig[]> {
    return this.adminRepo.listPlans();
  }
}
