import { GetCheckoutInfoUseCase } from './get-checkout-info.use-case';
import { RateUnavailableError } from '../../../domain/errors/rate-unavailable.error';
import { PlanNotFoundForCheckoutError } from '../../../domain/errors/plan-not-found-for-checkout.error';
import type { IPlatformRateProvider } from '../../../domain/repositories/platform-rate.provider';
import type { IPlanPriceProvider } from '../../../domain/repositories/plan-price.provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRateProvider(
  rate = 40.5,
  rateDate = '2026-08-05',
): jest.Mocked<IPlatformRateProvider> {
  return {
    getEffectiveRate: jest.fn().mockResolvedValue({ rate, rateDate }),
  };
}

function makePlanPriceProvider(
  priceUsd = 10,
  planName = 'Delta Plus',
): jest.Mocked<IPlanPriceProvider> {
  return {
    getActivePlanPrice: jest.fn().mockResolvedValue({
      planKey: 'delta_plus',
      planName,
      period: 'monthly',
      priceUsd,
    }),
    getPaymentInstructions: jest.fn().mockResolvedValue('Pague al número 0412-XXXXXXX'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetCheckoutInfoUseCase', () => {
  it('returns checkout info with server-calculated amountBs', async () => {
    const rateProvider = makeRateProvider(40.5, '2026-08-05');
    const planPriceProvider = makePlanPriceProvider(10, 'Delta Plus');
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    const result = await useCase.execute({ planKey: 'delta_plus', period: 'monthly' });

    expect(result.amountUsd).toBe(10);
    expect(result.bcvRate).toBe(40.5);
    expect(result.amountBs).toBe(405); // 10 * 40.5 = 405.00
    expect(result.bcvRateDate).toBe('2026-08-05');
    expect(result.planName).toBe('Delta Plus');
    expect(result.planKey).toBe('delta_plus');
    expect(result.period).toBe('monthly');
    expect(result.paymentInstructions).toBe('Pague al número 0412-XXXXXXX');
  });

  it('rounds amountBs to 2 decimal places', async () => {
    // 9.99 * 40.0 = 399.60 (exact, but verify the rounding path is exercised)
    const rateProvider = makeRateProvider(40.333, '2026-08-05');
    const planPriceProvider = makePlanPriceProvider(9.99, 'Plan Básico');
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    const result = await useCase.execute({ planKey: 'basico', period: 'monthly' });

    // 9.99 * 40.333 = 402.926... → rounded to 402.93
    expect(result.amountBs).toBe(Math.round(9.99 * 40.333 * 100) / 100);
  });

  it('includes VENEZUELAN_BANKS catalog in the result', async () => {
    const rateProvider = makeRateProvider();
    const planPriceProvider = makePlanPriceProvider();
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    const result = await useCase.execute({ planKey: 'delta_plus', period: 'monthly' });

    expect(Array.isArray(result.banks)).toBe(true);
    expect(result.banks.length).toBeGreaterThan(0);
    expect(result.banks[0]).toHaveProperty('code');
    expect(result.banks[0]).toHaveProperty('name');
  });

  it('fetches plan price and rate in parallel (both providers are called)', async () => {
    const rateProvider = makeRateProvider();
    const planPriceProvider = makePlanPriceProvider();
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    await useCase.execute({ planKey: 'delta_plus', period: 'annual' });

    expect(rateProvider.getEffectiveRate).toHaveBeenCalledTimes(1);
    expect(planPriceProvider.getActivePlanPrice).toHaveBeenCalledWith('delta_plus', 'annual');
    expect(planPriceProvider.getPaymentInstructions).toHaveBeenCalledTimes(1);
  });

  it('propagates RateUnavailableError when no BCV rate is available', async () => {
    const rateProvider: jest.Mocked<IPlatformRateProvider> = {
      getEffectiveRate: jest.fn().mockRejectedValue(new RateUnavailableError()),
    };
    const planPriceProvider = makePlanPriceProvider();
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    await expect(useCase.execute({ planKey: 'delta_plus', period: 'monthly' })).rejects.toThrow(
      RateUnavailableError,
    );
  });

  it('propagates PlanNotFoundForCheckoutError when plan is inactive or unknown', async () => {
    const rateProvider = makeRateProvider();
    const planPriceProvider: jest.Mocked<IPlanPriceProvider> = {
      getActivePlanPrice: jest
        .fn()
        .mockRejectedValue(new PlanNotFoundForCheckoutError('unknown_plan', 'monthly')),
      getPaymentInstructions: jest.fn().mockResolvedValue(''),
    };
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    await expect(useCase.execute({ planKey: 'unknown_plan', period: 'monthly' })).rejects.toThrow(
      PlanNotFoundForCheckoutError,
    );
  });

  it('returns empty paymentInstructions without throwing when setting is missing', async () => {
    const rateProvider = makeRateProvider();
    const planPriceProvider: jest.Mocked<IPlanPriceProvider> = {
      getActivePlanPrice: jest.fn().mockResolvedValue({
        planKey: 'delta_plus',
        planName: 'Delta Plus',
        period: 'monthly',
        priceUsd: 10,
      }),
      getPaymentInstructions: jest.fn().mockResolvedValue(''),
    };
    const useCase = new GetCheckoutInfoUseCase(rateProvider, planPriceProvider);

    const result = await useCase.execute({ planKey: 'delta_plus', period: 'monthly' });

    expect(result.paymentInstructions).toBe('');
  });
});
