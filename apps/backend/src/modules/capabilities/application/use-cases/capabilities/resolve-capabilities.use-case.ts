import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ROLE_CAPABILITY_REPOSITORY,
  type IRoleCapabilityRepository,
} from '../../../domain/repositories/role-capability.repository';
import {
  buildCapabilityMap,
  type ModuleCapabilityMap,
} from '../../../domain/entities/role-capability.entity';

export interface ResolveCapabilitiesOutput {
  role: string;
  modules: ModuleCapabilityMap;
}

const CACHE_TTL_SECONDS = 300;

/**
 * Resolves the full capability map for a given role.
 *
 * Cache strategy:
 *   1. Try Redis key `capabilities:{role}` (TTL 300s).
 *   2. On Redis miss or error, fall back to the database.
 *   3. On successful DB read, populate Redis (best-effort — Redis errors are
 *      logged and silently swallowed so a Redis outage never breaks the response).
 *
 * Default-deny: any action not present in role_capabilities defaults to false.
 */
@Injectable()
export class ResolveCapabilitiesUseCase {
  private readonly logger = new Logger(ResolveCapabilitiesUseCase.name);

  constructor(
    @Inject(ROLE_CAPABILITY_REPOSITORY)
    private readonly capabilityRepo: IRoleCapabilityRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(role: string): Promise<ResolveCapabilitiesOutput> {
    const cacheKey = `capabilities:${role}`;

    // 1. Attempt Redis read
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const modules = JSON.parse(cached) as ModuleCapabilityMap;
        return { role, modules };
      }
    } catch (err) {
      this.logger.warn(`Redis read failed for ${cacheKey} — falling back to DB`, err);
    }

    // 2. DB fallback
    const rows = await this.capabilityRepo.findByRole(role);
    const modules = buildCapabilityMap(rows);

    // 3. Best-effort cache population
    try {
      await this.redis.set(cacheKey, JSON.stringify(modules), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Redis write failed for ${cacheKey} — cache will be skipped`, err);
    }

    return { role, modules };
  }
}
