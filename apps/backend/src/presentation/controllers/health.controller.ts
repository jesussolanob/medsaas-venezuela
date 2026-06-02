import { Controller, Get, Inject } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/cache/redis.constants';

type DependencyStatus = 'up' | 'down';

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
  };
}

@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('health')
  async health(): Promise<HealthResponse> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    const allUp = postgres === 'up' && redis === 'up';
    return {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: { postgres, redis },
    };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await this.sequelize.authenticate();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
