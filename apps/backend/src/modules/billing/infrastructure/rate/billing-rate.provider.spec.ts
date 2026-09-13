import { BillingRateProvider } from './billing-rate.provider';
import { RateUnavailableError } from '../../domain/errors/rate-unavailable.error';
import type { AppSettingModel } from '../../../finances/infrastructure/database/models/app-setting.model';
import type { IBcvRateFetcher } from '../../../finances/domain/repositories/rate-fetcher.ports';

/**
 * El defecto que estos tests cierran: el proveedor leía `usdt_rate`, que es la
 * tasa EFECTIVA del sistema (Binance, manual o BCV según `rate_source`), y la
 * devolvía rotulada como tasa BCV. Con la fuente en Binance el checkout del
 * plan cotizaba 886,20 mientras el resto del portal mostraba 772,54.
 *
 * La guarda de regresión es el último test: `usdt_rate` no se lee NUNCA, ni
 * siquiera como último recurso.
 */
describe('BillingRateProvider', () => {
  const BCV = 772.5441;
  const EFECTIVA_BINANCE = 886.2;

  function fila(value: string, updatedAt: Date) {
    return { key: 'usdt_bcv_rate', value, updatedAt } as AppSettingModel;
  }

  function hace(horas: number): Date {
    return new Date(Date.now() - horas * 60 * 60 * 1000);
  }

  let appSettingModel: { findByPk: jest.Mock; upsert: jest.Mock };
  let bcvFetcher: jest.Mocked<IBcvRateFetcher>;
  let provider: BillingRateProvider;

  beforeEach(() => {
    appSettingModel = { findByPk: jest.fn(), upsert: jest.fn().mockResolvedValue(undefined) };
    bcvFetcher = { fetchRate: jest.fn() };
    provider = new BillingRateProvider(
      appSettingModel as unknown as typeof AppSettingModel,
      bcvFetcher,
    );
  });

  it('usa la tasa guardada sin salir a la red cuando es reciente', async () => {
    appSettingModel.findByPk.mockResolvedValue(fila(String(BCV), hace(1)));

    const result = await provider.getEffectiveRate();

    expect(result.rate).toBe(BCV);
    expect(bcvFetcher.fetchRate).not.toHaveBeenCalled();
  });

  it('consulta el BCV en vivo cuando la guardada está vieja, y la persiste', async () => {
    appSettingModel.findByPk.mockResolvedValue(fila('700', hace(48)));
    bcvFetcher.fetchRate.mockResolvedValue(BCV);

    const result = await provider.getEffectiveRate();

    expect(result.rate).toBe(BCV);
    expect(appSettingModel.upsert).toHaveBeenCalledWith({
      key: 'usdt_bcv_rate',
      value: String(BCV),
    });
  });

  it('consulta el BCV en vivo cuando no hay nada guardado', async () => {
    appSettingModel.findByPk.mockResolvedValue(null);
    bcvFetcher.fetchRate.mockResolvedValue(BCV);

    await expect(provider.getEffectiveRate()).resolves.toMatchObject({ rate: BCV });
  });

  it('cae a la última BCV conocida, CON SU FECHA, si la consulta en vivo falla', async () => {
    const anteayer = hace(48);
    appSettingModel.findByPk.mockResolvedValue(fila('700', anteayer));
    bcvFetcher.fetchRate.mockResolvedValue(null);

    const result = await provider.getEffectiveRate();

    // La fecha es la de la tasa vieja, no la de hoy: la pantalla la muestra y
    // así la desactualización se ve en vez de disimularse.
    expect(result).toEqual({ rate: 700, rateDate: anteayer.toISOString().slice(0, 10) });
  });

  it('lanza RateUnavailableError si no hay tasa viva ni guardada', async () => {
    appSettingModel.findByPk.mockResolvedValue(null);
    bcvFetcher.fetchRate.mockResolvedValue(null);

    await expect(provider.getEffectiveRate()).rejects.toBeInstanceOf(RateUnavailableError);
  });

  it.each([
    ['no numérica', 'abc'],
    ['cero', '0'],
    ['negativa', '-5'],
  ])('descarta una tasa guardada %s y consulta en vivo', async (_caso, value) => {
    appSettingModel.findByPk.mockResolvedValue(fila(value, hace(1)));
    bcvFetcher.fetchRate.mockResolvedValue(BCV);

    await expect(provider.getEffectiveRate()).resolves.toMatchObject({ rate: BCV });
  });

  it('no rompe el checkout si falla al persistir la tasa recién consultada', async () => {
    appSettingModel.findByPk.mockResolvedValue(null);
    bcvFetcher.fetchRate.mockResolvedValue(BCV);
    appSettingModel.upsert.mockRejectedValue(new Error('BD caída'));

    await expect(provider.getEffectiveRate()).resolves.toMatchObject({ rate: BCV });
  });

  // ── Guarda de regresión ──────────────────────────────────────────────────
  it('NUNCA lee usdt_rate: sin BCV falla en vez de servir la tasa efectiva', async () => {
    // La efectiva existe y es la que se servía antes. No debe alcanzarse.
    appSettingModel.findByPk.mockImplementation((key: string) =>
      key === 'usdt_rate'
        ? Promise.resolve(fila(String(EFECTIVA_BINANCE), hace(1)))
        : Promise.resolve(null),
    );
    bcvFetcher.fetchRate.mockResolvedValue(null);

    await expect(provider.getEffectiveRate()).rejects.toBeInstanceOf(RateUnavailableError);
    expect(appSettingModel.findByPk).not.toHaveBeenCalledWith('usdt_rate');
  });
});
