import { Inject, Injectable } from '@nestjs/common';
import {
  PLATFORM_RATE_PROVIDER,
  type IPlatformRateProvider,
} from '../../../domain/repositories/platform-rate.provider';
import {
  PLAN_PRICE_PROVIDER,
  type IPlanPriceProvider,
} from '../../../domain/repositories/plan-price.provider';
import { VENEZUELAN_BANKS } from '@delta/shared-types';

export interface GetCheckoutInfoInput {
  planKey: string;
  period: string;
}

export interface CheckoutInfoOutput {
  planName: string;
  planKey: string;
  period: string;
  /** Price in USD from plan_prices (server-authoritative). */
  amountUsd: number;
  /** Price in Bolívares = round(amountUsd * bcvRate, 2). */
  amountBs: number;
  /** BCV rate used for the conversion (BS per USD). */
  bcvRate: number;
  /** ISO date of the BCV rate. */
  bcvRateDate: string;
  /** Full bank catalog for the checkout form selector. */
  banks: ReadonlyArray<{ code: string; name: string }>;
  /** Platform payment instructions from app_settings (editable by super_admin). */
  paymentInstructions: string;
}

/**
 * Returns all the information the frontend needs to render the checkout modal:
 * plan details, Bolívar amount at current BCV rate, bank catalog, and payment
 * instructions.
 *
 * SECURITY: amountUsd is always read from plan_prices (server-side).
 * The client MUST NOT pass amounts — they are not accepted in the POST body.
 */
@Injectable()
export class GetCheckoutInfoUseCase {
  constructor(
    @Inject(PLATFORM_RATE_PROVIDER)
    private readonly rateProvider: IPlatformRateProvider,
    @Inject(PLAN_PRICE_PROVIDER)
    private readonly planPriceProvider: IPlanPriceProvider,
  ) {}

  async execute(input: GetCheckoutInfoInput): Promise<CheckoutInfoOutput> {
    // Fetch plan price and BCV rate in parallel for minimum latency.
    const [priceInfo, rateResolution, paymentInstructions] = await Promise.all([
      this.planPriceProvider.getActivePlanPrice(input.planKey, input.period),
      this.rateProvider.getEffectiveRate(),
      this.planPriceProvider.getPaymentInstructions(),
    ]);

    // amountBs = round(amountUsd * bcvRate, 2)
    const amountBs = Math.round(priceInfo.priceUsd * rateResolution.rate * 100) / 100;

    return {
      planName: priceInfo.planName,
      planKey: priceInfo.planKey,
      period: priceInfo.period,
      amountUsd: priceInfo.priceUsd,
      amountBs,
      bcvRate: rateResolution.rate,
      bcvRateDate: rateResolution.rateDate,
      banks: VENEZUELAN_BANKS,
      paymentInstructions,
    };
  }
}
