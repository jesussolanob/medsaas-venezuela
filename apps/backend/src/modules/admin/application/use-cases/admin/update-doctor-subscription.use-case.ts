import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

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
  }
}
