import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IPlatformRateProvider,
  RateResolution,
} from '../../domain/repositories/platform-rate.provider';
import { RateUnavailableError } from '../../domain/errors/rate-unavailable.error';
import {
  BCV_RATE_FETCHER,
  type IBcvRateFetcher,
} from '../../../finances/domain/repositories/rate-fetcher.ports';
// Re-use the app_settings model from the finances module.
// This is an infrastructure import (billing infra ← finances infra model),
// which is acceptable per DDD layering rules. Only the domain layer must not
// import from other modules.
import { AppSettingModel } from '../../../finances/infrastructure/database/models/app-setting.model';

/** Última tasa BCV conocida. La escribe el módulo de finanzas y también este proveedor. */
const KEY_BCV = 'usdt_bcv_rate';

/**
 * Ventana de frescura: si la tasa guardada tiene menos de estas horas, se usa
 * tal cual y no se sale a la red. El BCV publica una vez por día, así que seis
 * horas mantienen el checkout rápido sin servir una tasa de ayer.
 *
 * Se mide en HORAS y no "es de hoy en Caracas" a propósito: comparar por día
 * calendario obliga a convertir zonas horarias en un lugar más, y este proyecto
 * ya se equivocó dos veces con eso (ADR-064, ADR-074). La edad no depende de
 * ninguna zona.
 */
const FRESHNESS_WINDOW_HOURS = 6;

/**
 * Implementa IPlatformRateProvider con la tasa **del BCV**.
 *
 * ⚠️ Antes leía `app_settings['usdt_rate']`, que NO es la tasa del BCV: es la
 * tasa EFECTIVA del sistema, la que corresponda a `rate_source` (binance,
 * manual o bcv). Con la fuente en Binance —que es el default— el checkout del
 * plan mostraba 886,20 Bs/USD rotulado **"Tasa BCV"**, mientras el resto del
 * portal mostraba la BCV real, 772,54. Un 14,7% de diferencia sobre el monto
 * que el especialista efectivamente transfiere para pagarle a Delta, y sobre el
 * `amount_bs` que queda guardado en su pago.
 *
 * El error estaba solo en el proveedor: el puerto, el caso de uso y la
 * respuesta ya llamaban `bcvRate` a este número. La intención siempre fue el
 * BCV; lo que estaba mal era de dónde se leía.
 *
 * Cadena de resolución:
 *   1. `app_settings['usdt_bcv_rate']` si tiene menos de 6 h  → camino rápido
 *   2. consulta en vivo al BCV (dolarapi → pydolarve)         → se persiste
 *   3. `app_settings['usdt_bcv_rate']` aunque esté vieja      → con SU fecha
 *   4. RateUnavailableError
 *
 * 🔒 **Nunca cae a `usdt_rate`.** Ese es justamente el defecto que se corrige:
 * preferir un número cualquiera antes que ninguno es lo que hizo que un monto
 * equivocado viviera meses sin que nadie lo notara. Si no hay BCV, se falla —
 * el caso de uso ya propaga el error y la pantalla no inventa un monto.
 *
 * NUNCA devuelve 0 ni NaN.
 */
@Injectable()
export class BillingRateProvider implements IPlatformRateProvider {
  private readonly logger = new Logger(BillingRateProvider.name);

  constructor(
    @InjectModel(AppSettingModel)
    private readonly appSettingModel: typeof AppSettingModel,
    @Inject(BCV_RATE_FETCHER)
    private readonly bcvFetcher: IBcvRateFetcher,
  ) {}

  async getEffectiveRate(): Promise<RateResolution> {
    const stored = await this.readStoredBcv();

    // 1. Guardada y fresca: no hace falta salir a la red.
    if (stored && this.isFresh(stored.updatedAt)) {
      return { rate: stored.rate, rateDate: toDateString(stored.updatedAt) };
    }

    // 2. Consulta en vivo. El fetcher NUNCA lanza: devuelve null si falla.
    const fresh = await this.bcvFetcher.fetchRate();
    if (fresh !== null && Number.isFinite(fresh) && fresh > 0) {
      await this.persistBcv(fresh);
      return { rate: fresh, rateDate: toDateString(new Date()) };
    }

    // 3. No se pudo refrescar: se usa la última BCV conocida CON SU PROPIA
    //    fecha. Es vieja, pero es del BCV, y la pantalla muestra la fecha —
    //    así la desactualización se ve en vez de disimularse.
    if (stored) {
      this.logger.warn(
        'No se pudo refrescar la tasa BCV; se usa la última conocida del ' +
          toDateString(stored.updatedAt),
      );
      return { rate: stored.rate, rateDate: toDateString(stored.updatedAt) };
    }

    throw new RateUnavailableError();
  }

  /** Lee `usdt_bcv_rate` descartando valores no numéricos, 0 y negativos. */
  private async readStoredBcv(): Promise<{ rate: number; updatedAt: Date } | null> {
    const row = await this.appSettingModel.findByPk(KEY_BCV);
    if (!row) return null;

    const parsed = parseFloat(row.value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    return { rate: parsed, updatedAt: row.updatedAt ?? new Date(0) };
  }

  private isFresh(updatedAt: Date): boolean {
    const ageMs = Date.now() - updatedAt.getTime();
    return ageMs >= 0 && ageMs < FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;
  }

  /**
   * Guarda la tasa recién consultada como "última BCV conocida".
   *
   * Es la MISMA clave y el MISMO significado que escribe el módulo de finanzas,
   * así que dos escrituras concurrentes solo pisan un número por otro casi
   * idéntico: no hay estado que corromper. Sin esta escritura el camino rápido
   * nunca se cumpliría mientras `rate_source` no sea 'bcv', y el checkout
   * saldría a la red en cada carga (hasta 10 s con los dos intentos del fetcher).
   *
   * Best-effort: si falla, no se rompe el checkout — ya tenemos la tasa.
   */
  private async persistBcv(rate: number): Promise<void> {
    try {
      await this.appSettingModel.upsert({ key: KEY_BCV, value: String(rate) });
    } catch (err) {
      this.logger.warn(`No se pudo persistir la tasa BCV: ${String(err)}`);
    }
  }
}

/** `YYYY-MM-DD` — mismo formato que devolvía la implementación anterior. */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
