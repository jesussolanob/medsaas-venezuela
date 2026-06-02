import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type SubscriptionListResult,
} from '../../../domain/repositories/admin.repository';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

export interface GetSubscriptionsInput {
  page: number;
  limit: number;
  status?: SubscriptionStatus;
  plan?: SubscriptionPlan;
}

@Injectable()
export class GetSubscriptionsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetSubscriptionsInput): Promise<SubscriptionListResult> {
    return this.adminRepo.listSubscriptions({
      page: input.page,
      limit: input.limit,
      status: input.status,
      plan: input.plan,
    });
  }
}
