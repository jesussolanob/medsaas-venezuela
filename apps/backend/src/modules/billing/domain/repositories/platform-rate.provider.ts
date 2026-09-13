/**
 * Domain port: IPlatformRateProvider
 *
 * Provides the current BCV exchange rate (BS per USD) for platform billing
 * operations (checkout info, payment submission).
 *
 * This interface lives in the billing domain so that application use-cases
 * depend on an abstraction, not on the finances infrastructure.
 *
 * ⚠️ "La tasa del BCV" es literal: NO es la tasa efectiva del sistema. El
 * portal maneja tres (manual, Binance, BCV) y una efectiva según `rate_source`,
 * y el plan que el especialista le paga a Delta se cotiza SIEMPRE con la del
 * BCV. Mismo criterio que los pagos a vendedores (ADR-049).
 */

export const PLATFORM_RATE_PROVIDER = 'PLATFORM_RATE_PROVIDER';

export interface RateResolution {
  /** Exchange rate in bolivars per USD. Never 0 or NaN. */
  rate: number;
  /** ISO date string (YYYY-MM-DD) of when the rate was last updated. */
  rateDate: string;
}

export interface IPlatformRateProvider {
  /**
   * Devuelve la tasa del BCV (Bs por USD) para cotizar el plan.
   *
   * Orden de resolución:
   *   1. `app_settings['usdt_bcv_rate']` si tiene menos de 6 h
   *   2. consulta en vivo al BCV, que se persiste como última conocida
   *   3. `app_settings['usdt_bcv_rate']` aunque esté vieja, con SU fecha
   *
   * 🔒 Nunca cae a `usdt_rate` (la efectiva): si no hay BCV, falla.
   *
   * @throws RateUnavailableError cuando no se puede resolver ninguna tasa BCV.
   * NUNCA devuelve 0 ni NaN.
   */
  getEffectiveRate(): Promise<RateResolution>;
}
