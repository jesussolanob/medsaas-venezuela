import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type ActivityStatus,
  type DoctorListResult,
} from '../../../domain/repositories/admin.repository';
import type { SubscriptionStatus } from '@delta/shared-types';

export interface GetDoctorsListInput {
  page: number;
  limit: number;
  activityStatus?: ActivityStatus;
  subscriptionStatus?: SubscriptionStatus;
}

/**
 * Returns a paginated list of doctors with their activity and subscription status.
 *
 * Activity filtering happens in-memory because there is no lastSignInAt column
 * in the DB in Etapa 1. In Fase 4, this will be pushed down to the query.
 */
@Injectable()
export class GetDoctorsListUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetDoctorsListInput): Promise<DoctorListResult> {
    return this.adminRepo.listDoctors({
      page: input.page,
      limit: input.limit,
      activityStatus: input.activityStatus,
      subscriptionStatus: input.subscriptionStatus,
    });
  }
}
