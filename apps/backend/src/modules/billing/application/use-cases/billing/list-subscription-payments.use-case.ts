import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
  type SubscriptionPaymentListFilters,
  type SubscriptionPaymentListResult,
} from '../../../domain/repositories/subscription-payment.repository';
import type { SubscriptionPaymentStatus } from '../../../domain/entities/subscription-payment.entity';

export interface ListSubscriptionPaymentsInput {
  status?: SubscriptionPaymentStatus;
  page?: number;
  limit?: number;
}

/**
 * Lists subscription payments (admin use case).
 * Optionally filters by status.
 */
@Injectable()
export class ListSubscriptionPaymentsUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
  ) {}

  async execute(input: ListSubscriptionPaymentsInput): Promise<SubscriptionPaymentListResult> {
    const filters: SubscriptionPaymentListFilters = {
      status: input.status,
      page: Math.max(1, input.page ?? 1),
      limit: Math.min(100, Math.max(1, input.limit ?? 20)),
    };

    return this.repo.list(filters);
  }
}
