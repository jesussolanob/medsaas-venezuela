import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { DoctorScheduleParams } from '../../../domain/value-objects/doctor-schedule.vo';
import {
  DOCTOR_SCHEDULE_REPOSITORY,
  type IDoctorScheduleRepository,
} from '../../../domain/repositories/doctor-schedule.repository';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';

@Injectable()
export class UpdateDoctorScheduleUseCase {
  constructor(
    @Inject(DOCTOR_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IDoctorScheduleRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(doctorId: string, params: DoctorScheduleParams): Promise<DoctorScheduleParams> {
    const saved = await this.scheduleRepo.upsert(doctorId, params);

    // Best-effort invalidation of cached appointment slots.
    // A Redis failure must never rollback a successful schedule upsert.
    await this.invalidateSlotCache(doctorId);

    return saved;
  }

  /**
   * Scans for all keys matching `slots:{doctorId}:*` and deletes them.
   * Uses SCAN to avoid blocking the Redis event loop on large keyspaces.
   *
   * Wrapped in try/catch: Redis being unavailable is non-critical here —
   * stale slot cache is preferable to a 500 that discards a valid upsert.
   */
  private async invalidateSlotCache(doctorId: string): Promise<void> {
    const pattern = `slots:${doctorId}:*`;
    let cursor = '0';

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Redis unavailable — slot cache may be stale; callers will recompute on next read
    }
  }
}
