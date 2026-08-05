import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IPlanPriceProvider,
  PlanPriceInfo,
} from '../../../domain/repositories/plan-price.provider';
import { PlanNotFoundForCheckoutError } from '../../../domain/errors/plan-not-found-for-checkout.error';
// Re-use admin module models — billing infra importing admin infra is acceptable.
import { PlanConfigModel } from '../../../../admin/infrastructure/database/models/plan-config.model';
import { PlanPriceModel } from '../../../../admin/infrastructure/database/models/plan-price.model';
// Re-use finances module model for app_settings.
import { AppSettingModel } from '../../../../finances/infrastructure/database/models/app-setting.model';

/**
 * Implements IPlanPriceProvider using the admin plan_configs + plan_prices tables
 * and the finances app_settings table.
 *
 * This implementation re-registers the admin and finances models via billing's
 * SequelizeModule.forFeature(). Re-registering the same model class in multiple
 * modules is the correct NestJS pattern for cross-module table access (as done
 * by billing for ProfileAdminModel and AdminSubscriptionModel).
 */
@Injectable()
export class SequelizePlanPriceProvider implements IPlanPriceProvider {
  constructor(
    @InjectModel(PlanConfigModel)
    private readonly planConfigModel: typeof PlanConfigModel,
    @InjectModel(PlanPriceModel)
    private readonly planPriceModel: typeof PlanPriceModel,
    @InjectModel(AppSettingModel)
    private readonly appSettingModel: typeof AppSettingModel,
  ) {}

  async getActivePlanPrice(planKey: string, period: string): Promise<PlanPriceInfo> {
    // Verify the plan config exists and is active.
    const planConfig = await this.planConfigModel.findOne({
      where: { planKey, isActive: true },
    });
    if (!planConfig) {
      throw new PlanNotFoundForCheckoutError(planKey, period);
    }

    // Look up the price for the requested period.
    const priceRow = await this.planPriceModel.findOne({
      where: { planKey, period, isActive: true },
    });
    if (!priceRow) {
      throw new PlanNotFoundForCheckoutError(planKey, period);
    }

    return {
      planKey,
      planName: planConfig.name,
      period,
      priceUsd: Number(priceRow.priceUsd),
    };
  }

  async getPaymentInstructions(): Promise<string> {
    try {
      const row = await this.appSettingModel.findByPk('platform_payment_instructions');
      return row?.value ?? '';
    } catch {
      // Non-fatal — return empty string so checkout info is still usable.
      return '';
    }
  }
}
