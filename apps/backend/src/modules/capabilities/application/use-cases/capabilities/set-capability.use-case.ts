import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ROLE_CAPABILITY_REPOSITORY,
  type IRoleCapabilityRepository,
} from '../../../domain/repositories/role-capability.repository';
import type { RoleCapability } from '../../../domain/entities/role-capability.entity';

export interface SetCapabilityInput {
  role: string;
  moduleKey: string;
  action: string;
  allowed: boolean;
}

/**
 * Creates or updates a single capability row and invalidates the Redis cache
 * for the affected role.
 *
 * Cache invalidation is direct key deletion (`DEL capabilities:{role}`).
 * It is best-effort: if Redis is unavailable the deletion is skipped and the
 * stale cache will expire at its TTL (300 s).
 */
@Injectable()
export class SetCapabilityUseCase {
  private readonly logger = new Logger(SetCapabilityUseCase.name);

  constructor(
    @Inject(ROLE_CAPABILITY_REPOSITORY)
    private readonly capabilityRepo: IRoleCapabilityRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(input: SetCapabilityInput): Promise<RoleCapability> {
    const saved = await this.capabilityRepo.upsert(
      input.role,
      input.moduleKey,
      input.action,
      input.allowed,
    );

    // Best-effort cache invalidation — never let Redis down block the response
    try {
      await this.redis.del(`capabilities:${input.role}`);
    } catch (err) {
      this.logger.warn(
        `Redis unavailable — capabilities:${input.role} cache will expire naturally`,
        err,
      );
    }

    return saved;
  }
}
