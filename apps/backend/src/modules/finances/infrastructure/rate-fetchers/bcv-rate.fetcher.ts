import { Injectable, Logger } from '@nestjs/common';
import type { IBcvRateFetcher } from '../../domain/repositories/rate-fetcher.ports';

/** Timeout for each HTTP request in milliseconds. */
const TIMEOUT_MS = 5_000;

/** El sitio del BCV es una pagina HTML completa: necesita mas aire que una API. */
const BCV_SITE_TIMEOUT_MS = 8_000;

/**
 * Antiguedad maxima aceptada para el dato de un espejo.
 *
 * El BCV publica solo en dias habiles, asi que un valor del viernes sigue siendo
 * el vigente un lunes. Cinco dias cubre un feriado largo sin llegar a aceptar un
 * dato de la semana pasada.
 */
const MAX_MIRROR_AGE_DAYS = 5;

interface DolarApiResponse {
  promedio?: number;
  fechaActualizacion?: string;
}

interface PydolarResponse {
  price?: number;
}

/**
 * Obtiene la tasa oficial USD/VES del BCV.
 *
 * Orden de consulta:
 *   1. https://www.bcv.org.ve/ — **el BCV mismo**, raspando el bloque `id="dolar"`
 *   2. https://ve.dolarapi.com/v1/dolares/oficial — espejo (campo `promedio`)
 *   3. https://pydolarve.org/api/v2/dollar?page=bcv — espejo (campo `price`)
 *
 * ⚠️ **Por que el BCV va PRIMERO y no un espejo.** Se consultaba dolarapi primero
 * y el 2026-09-13 devolvia **832,4883** con `fechaActualizacion` del **11/09**,
 * mientras el sitio del BCV publicaba **842,2067**. Un 1,2% de diferencia servido
 * como si fuera la tasa del dia. Los espejos se atrasan; el BCV no puede
 * atrasarse respecto de si mismo.
 *
 * ⚠️ **Y los espejos ahora se validan por fecha.** `fechaActualizacion` venia en
 * la respuesta y nadie la miraba: el dato viejo entraba igual, sin un solo aviso.
 * Un valor de mas de 5 dias se descarta y se pasa al siguiente.
 *
 * Nota: el frontend tiene su propia cadena (pydolarve → dolarapi → BCV) en
 * `app/api/admin/bcv-rate/route.ts`, con el orden al reves. Mientras sigan siendo
 * dos cadenas distintas, las dos mitades de la app pueden mostrar numeros
 * distintos — ver la deuda anotada en el ADR-083.
 *
 * Devuelve null ante cualquier error de red, timeout o respuesta ilegible.
 * NUNCA lanza: quien llama trata el null como un fallo blando.
 */
@Injectable()
export class BcvRateFetcher implements IBcvRateFetcher {
  private readonly logger = new Logger(BcvRateFetcher.name);

  async fetchRate(): Promise<number | null> {
    const official = await this.fetchFromBcvSite();
    if (official !== null) return official;

    this.logger.warn('El sitio del BCV no respondio; se consulta el espejo dolarapi');
    const primary = await this.fetchPrimary();
    if (primary !== null) return primary;

    this.logger.warn('BCV primary source failed; trying fallback');
    return this.fetchFallback();
  }

  /**
   * Raspa la tasa del sitio del BCV.
   *
   * El valor vive en un bloque con `id="dolar"`, dentro de un `<strong>`, en
   * formato venezolano (`842,20670000`). Mismo patron que ya usa en produccion
   * la ruta `/api/admin/bcv-rate` del frontend.
   */
  private async fetchFromBcvSite(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BCV_SITE_TIMEOUT_MS);

    try {
      const response = await fetch('https://www.bcv.org.ve/', {
        signal: controller.signal,
        headers: {
          // Sin User-Agent de navegador el sitio del BCV responde distinto.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-VE,es;q=0.9',
        },
      });

      if (!response.ok) {
        this.logger.warn(`www.bcv.org.ve respondio HTTP ${response.status}`);
        return null;
      }

      const parsed = parseBcvHtml(await response.text());
      if (parsed === null) {
        // Si el BCV rediseña la pagina, esto avisa en vez de quedarse mudo.
        this.logger.warn('No se pudo extraer la tasa del HTML del BCV');
        return null;
      }

      return parsed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BcvRateFetcher error en el sitio del BCV: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchPrimary(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`ve.dolarapi.com responded with HTTP ${response.status}`);
        return null;
      }

      const body = (await response.json()) as DolarApiResponse;
      const value = body.promedio;

      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        this.logger.warn(`ve.dolarapi.com returned invalid promedio: ${String(value)}`);
        return null;
      }

      // El espejo declara cuando se actualizo; si esta viejo, no es la tasa del
      // dia y se prefiere seguir bajando por la cadena antes que servirla.
      if (isStale(body.fechaActualizacion)) {
        this.logger.warn(
          `ve.dolarapi.com devolvio una tasa del ${String(body.fechaActualizacion)}: se descarta por vieja`,
        );
        return null;
      }

      return value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BcvRateFetcher primary error: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchFallback(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`pydolarve.org responded with HTTP ${response.status}`);
        return null;
      }

      const body = (await response.json()) as PydolarResponse;
      const value = body.price;

      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        this.logger.warn(`pydolarve.org returned invalid price: ${String(value)}`);
        return null;
      }

      return value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BcvRateFetcher fallback error: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Extrae la tasa del HTML del BCV.
 *
 * Exportada para poder probarla contra HTML real sin salir a la red: es la pieza
 * que se rompe sola el dia que el BCV rediseñe la pagina.
 */
export function parseBcvHtml(html: string): number | null {
  // El bloque principal: <div id="dolar"> ... <strong>842,20670000</strong>
  const match =
    html.match(/id="dolar"[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i) ??
    html.match(/USD[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i);

  if (!match?.[1]) return null;

  // Formato venezolano: el punto separa miles y la coma los decimales.
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * ¿El dato declarado por un espejo es mas viejo que la ventana aceptada?
 *
 * Una fecha ausente o ilegible NO se considera vieja: el espejo puede no
 * declararla, y descartar por eso dejaria la cadena sin respaldo.
 */
function isStale(fechaActualizacion: string | undefined): boolean {
  if (!fechaActualizacion) return false;

  const fecha = new Date(fechaActualizacion);
  if (Number.isNaN(fecha.getTime())) return false;

  const ageMs = Date.now() - fecha.getTime();
  return ageMs > MAX_MIRROR_AGE_DAYS * 24 * 60 * 60 * 1000;
}
