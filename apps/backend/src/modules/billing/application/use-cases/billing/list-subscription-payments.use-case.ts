import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
  type SubscriptionPaymentListFilters,
} from '../../../domain/repositories/subscription-payment.repository';
import type {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../../../domain/entities/subscription-payment.entity';
import {
  PROFILE_LOOKUP_REPOSITORY,
  type IProfileLookupRepository,
  type DoctorProfileSnapshot,
} from '../../../domain/repositories/profile-lookup.repository';

export interface ListSubscriptionPaymentsInput {
  status?: SubscriptionPaymentStatus;
  page?: number;
  limit?: number;
}

export interface EnrichedSubscriptionPaymentListResult {
  items: SubscriptionPayment[];
  /** Keyed by doctorId. Missing entry means the profile was not found. */
  profiles: Map<string, DoctorProfileSnapshot>;
  total: number;
  page: number;
  limit: number;
}

/**
 * Lists subscription payments (admin use case).
 * Optionally filters by status.
 *
 * Also resolves doctor identity (name, email, specialty) in a single batched
 * query — no N+1. The enriched profiles map is returned alongside the payment
 * list so the controller can build full response rows without any additional
 * queries.
 *
 * SECURITY: doctor name/email/specialty are doctor PII — this use case must only
 * be called from super_admin-guarded endpoints.
 */
@Injectable()
export class ListSubscriptionPaymentsUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
    @Inject(PROFILE_LOOKUP_REPOSITORY)
    private readonly profileLookup: IProfileLookupRepository,
  ) {}

  async execute(
    input: ListSubscriptionPaymentsInput,
  ): Promise<EnrichedSubscriptionPaymentListResult> {
    const filters: SubscriptionPaymentListFilters = {
      status: input.status,
      page: Math.max(1, input.page ?? 1),
      limit: Math.min(1000, Math.max(1, input.limit ?? 20)),
    };

    const result = await this.repo.list(filters);

    // Collect distinct doctorIds and fetch all profiles in one query (no N+1).
    const distinctDoctorIds = [...new Set(result.items.map((p) => p.doctorId))];
    const profileRows = await this.profileLookup.findByIds(distinctDoctorIds);

    const profiles = new Map<string, DoctorProfileSnapshot>(profileRows.map((p) => [p.id, p]));

    return {
      items: result.items,
      profiles,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}
