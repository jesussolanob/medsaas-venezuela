import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IPlatformRateProvider,
  RateResolution,
} from '../../domain/repositories/platform-rate.provider';
import { RateUnavailableError } from '../../domain/errors/rate-unavailable.error';
// Re-use the app_settings model from the finances module.
// This is an infrastructure import (billing infra ← finances infra model),
// which is acceptable per DDD layering rules. Only the domain layer must not
// import from other modules.
import { AppSettingModel } from '../../../finances/infrastructure/database/models/app-setting.model';

/**
 * Implements IPlatformRateProvider by reading from the app_settings table.
 *
 * The finances module always persists the effective BCV rate to app_settings
 * (key: 'usdt_rate') whenever it is updated (manually or via the BCV fetcher).
 * Reading from this table avoids importing the finances module's use cases or
 * Redis infrastructure into billing — the persistent store is the source of truth.
 *
 * Fallback chain:
 *   1. app_settings['usdt_rate']     — effective rate (all sources write here)
 *   2. app_settings['usdt_bcv_rate'] — last BCV-specific rate
 *   3. RateUnavailableError          — no rate found anywhere
 *
 * NEVER returns 0 or NaN.
 */
@Injectable()
export class BillingRateProvider implements IPlatformRateProvider {
  constructor(
    @InjectModel(AppSettingModel)
    private readonly appSettingModel: typeof AppSettingModel,
  ) {}

  async getEffectiveRate(): Promise<RateResolution> {
    // Try primary key first, then BCV-specific fallback.
    const keys = ['usdt_rate', 'usdt_bcv_rate'];

    for (const key of keys) {
      const row = await this.appSettingModel.findByPk(key);
      if (row) {
        const parsed = parseFloat(row.value);
        if (!isNaN(parsed) && parsed > 0) {
          const rateDate = row.updatedAt
            ? row.updatedAt.toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          return { rate: parsed, rateDate };
        }
      }
    }

    throw new RateUnavailableError();
  }
}
