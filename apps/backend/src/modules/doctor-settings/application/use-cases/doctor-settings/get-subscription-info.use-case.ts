import { Inject, Injectable } from '@nestjs/common';
import {
  SubscriptionInfo,
  type SubscriptionInfoParams,
} from '../../../domain/value-objects/subscription-info.vo';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
} from '../../../domain/repositories/subscription.repository';
import { SubscriptionNotFoundError } from '../../../domain/errors/subscription-not-found.error';

export interface SubscriptionInfoOutput {
  status: SubscriptionInfoParams['status'];
  plan: string;
  expiresAt: Date | null;
  daysUntilExpiry: number | null;
  bannerLevel: 'none' | 'warning' | 'critical' | 'suspended';
}

@Injectable()
export class GetSubscriptionInfoUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
  ) {}

  async execute(doctorId: string): Promise<SubscriptionInfoOutput> {
    const params = await this.subscriptionRepo.findByDoctorId(doctorId);
    if (!params) throw new SubscriptionNotFoundError(doctorId);

    const info = SubscriptionInfo.create(params);

    return {
      status: info.status,
      plan: info.plan,
      expiresAt: info.expiresAt,
      daysUntilExpiry: info.daysUntilExpiry,
      bannerLevel: info.bannerLevel,
    };
  }
}
