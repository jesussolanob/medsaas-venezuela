import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';
import { AccruePlanCommissionUseCase } from '../../../../seller-commissions/application/use-cases/accrue-plan-commission.use-case';
import { reportCommissionFailure } from '../../../../seller-commissions/application/report-commission-failure';

export interface UpdateDoctorSubscriptionInput {
  doctorId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  expiresAt: Date;
  notes?: string | null;
}

const DASHBOARD_CACHE_KEY = 'admin:dashboard';

/**
 * Updates a doctor's subscription manually from the admin panel.
 *
 * After a successful update, invalidates the admin dashboard cache so the next
 * request reflects updated subscription counts. Cache invalidation is best-effort:
 * if Redis is down the cache will expire naturally within its TTL (300 s).
 */
@Injectable()
export class UpdateDoctorSubscriptionUseCase {
  private readonly logger = new Logger(UpdateDoctorSubscriptionUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @Optional()
    private readonly accruePlanCommission: AccruePlanCommissionUseCase | null = null,
  ) {}

  async execute(input: UpdateDoctorSubscriptionInput): Promise<void> {
    // Verify the doctor exists before updating
    const existing = await this.adminRepo.findDoctorById(input.doctorId);
    if (!existing) throw new DoctorNotFoundError(input.doctorId);

    await this.adminRepo.updateDoctorSubscription({
      doctorId: input.doctorId,
      plan: input.plan,
      status: input.status,
      expiresAt: input.expiresAt,
      notes: input.notes ?? null,
    });

    // Best-effort cache invalidation — do not let a Redis failure block the response
    try {
      await this.redis.del(DASHBOARD_CACHE_KEY);
    } catch (err) {
      this.logger.warn('Redis unavailable — dashboard cache will expire naturally', err);
    }

    // Best-effort: accrue plan commission for the new plan (idempotent — DB UNIQUE constraint
    // ensures only the first paid-plan activation generates a commission).
    if (this.accruePlanCommission) {
      void this.accruePlanCommission.execute(input.doctorId, input.plan).catch((err: unknown) => {
        reportCommissionFailure(
          this.logger,
          {
            hook: 'update-subscription',
            specialistId: input.doctorId,
            type: 'plan',
            planKey: input.plan,
          },
          err,
        );
      });
    }
  }
}
