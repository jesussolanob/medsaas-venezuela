/**
 * Tasa del BCV — fuente ÚNICA para todo el frontend.
 *
 * Vive acá y no dentro del route handler porque hay que poder llamarla EN
 * PROCESO. La ruta del PDF público la pedía haciendo `fetch` a su propia URL
 * (`/api/admin/bcv-rate`), y esa vuelta por HTTP falla en el contenedor
 * desplegado: el PDF salía sin ningún monto en bolívares (antes del arreglo
 * salía con la tasa CONGELADA, que es peor porque nadie lo nota).
 *
 * Un servidor pidiéndose algo a sí mismo por su URL pública es una dependencia
 * de red innecesaria en un camino que puede resolverse con una llamada a
 * función. El route handler queda como una envoltura fina.
 *
 * ⚠️ **El orden de consulta es EL MISMO que el del backend**
 * (`apps/backend/src/modules/finances/infrastructure/rate-fetchers/bcv-rate.fetcher.ts`):
 *
 *   1. www.bcv.org.ve      — el BCV mismo (scraping)
 *   2. ve.dolarapi.com     — espejo
 *   3. pydolarve.org       — espejo
 *   4. currency-api        — SOLO USD, tasa de mercado aproximada, último recurso
 *
 * Antes se consultaba **pydolarve primero y el BCV último**, o sea el orden
 * inverso al del backend. Resultado: las dos mitades de la app podían mostrar
 * números distintos para lo mismo. El 2026-09-13 dolarapi devolvía 832,4883 con
 * fecha del 11/09 mientras el BCV publicaba 842,2067.
 *
 * 🔑 **Manda el BCV**: es la autoridad de su propia tasa. Un espejo solo puede
 * empatarlo o atrasarse. Si se agrega o reordena una fuente acá, hay que hacer
 * lo mismo en el fetcher del backend, o vuelven a divergir. Ver ADR-083/084.
 */

/** Lo que devuelve la consulta de tasas. `rate` en null = no se pudo obtener. */
export interface BcvRates {
  rate: number | null;
  date: string;
  source: string;
  eur_rate: number | null;
  eur_date: string;
  eur_source: string;
  message?: string;
}

/** Antigüedad máxima aceptada para el dato declarado por un espejo. */
const MAX_MIRROR_AGE_DAYS = 5;

/**
 * Vida de la caché en proceso.
 *
 * Sin caché esto raspaba el sitio del BCV —una página de ~150 KB— en CADA
 * llamada, y las hay en la reserva pública, el PDF de presupuestos y `useBcvRate`
 * al montar cualquier pantalla con dinero. El BCV publica una vez por día: una
 * hora deja la tasa fresca y baja las consultas a ~24 por instancia por día.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Caché por instancia. No se comparte entre instancias de Cloud Run y está
 * bien: cada una consulta como mucho una vez por hora.
 */
let cache: { payload: BcvRates; at: number } | null = null;

/**
 * Extrae una tasa del HTML del BCV.
 *
 * `id` es el bloque: "dolar" o "euro". El formato es venezolano
 * (`842,20670000`): el punto separa miles y la coma los decimales.
 *
 * Mismo patrón que `parseBcvHtml` en el backend — si el BCV rediseña la página,
 * los dos lados hay que tocarlos.
 */
export function parseBcvHtml(html: string, id: 'dolar' | 'euro'): number | null {
  const byId = new RegExp(`id="${id}"[\\s\\S]*?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`, 'i');
  const byLabel = id === 'dolar' ? /USD[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i : null;

  const match = html.match(byId) ?? (byLabel ? html.match(byLabel) : null);
  if (!match?.[1]) return null;

  const parsed = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * ¿El dato que declara un espejo es más viejo que la ventana aceptada?
 *
 * Una fecha ausente o ilegible NO cuenta como vieja: hay espejos que no la
 * declaran, y descartar por eso dejaría la cadena sin respaldo.
 */
function isStale(fecha: string | undefined): boolean {
  if (!fecha) return false;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > MAX_MIRROR_AGE_DAYS * 24 * 60 * 60 * 1000;
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-VE,es;q=0.9',
};

const JSON_HEADERS = { Accept: 'application/json', 'User-Agent': 'DeltaMedicalCRM/1.0' };

/** Baja el HTML del BCV una sola vez por consulta: sirve para USD y para EUR. */
async function fetchBcvHtml(): Promise<string | null> {
  try {
    const res = await fetch('https://www.bcv.org.ve/', {
      signal: AbortSignal.timeout(8000),
      headers: BROWSER_HEADERS,
      cache: 'no-store',
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// ─── USD ──────────────────────────────────────────────────────────────────

async function usdFromDolarApi(): Promise<{ rate: number; date: string } | null> {
  for (const url of [
    'https://ve.dolarapi.com/v1/dolares/oficial',
    'https://ve.dolarapi.com/v1/dolares',
  ]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: JSON_HEADERS,
        cache: 'no-store',
      });
      if (!res.ok) continue;

      const data = await res.json();
      const entry = Array.isArray(data)
        ? data.find((d: { casa?: string }) => d.casa === 'oficial' || d.casa === 'bcv')
        : data;
      if (!entry) continue;

      const value = entry.promedio || entry.venta || entry.compra;
      if (!value || value <= 0) continue;

      // El espejo declara cuándo se actualizó; si está viejo no es la tasa del
      // día y se prefiere seguir bajando por la cadena antes que servirla.
      if (isStale(entry.fechaActualizacion)) continue;

      return { rate: value, date: entry.fechaActualizacion || '' };
    } catch {
      // siguiente endpoint
    }
  }
  return null;
}

async function usdFromPydolarve(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
      signal: AbortSignal.timeout(8000),
      headers: JSON_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const usd = (await res.json())?.monitors?.usd;
    if (!usd?.price || usd.price <= 0) return null;
    if (isStale(usd.last_update)) return null;

    return { rate: usd.price, date: usd.last_update || '' };
  } catch {
    return null;
  }
}

async function usdFromCurrencyApi(): Promise<{ rate: number; date: string } | null> {
  for (const url of [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
  ]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) continue;

      const data = await res.json();
      const ves = data?.usd?.ves ?? data?.ves;
      if (!ves || ves <= 0) continue;

      return { rate: parseFloat(Number(ves).toFixed(2)), date: data.date || '' };
    } catch {
      // siguiente CDN
    }
  }
  return null;
}

// ─── EUR ──────────────────────────────────────────────────────────────────

async function eurFromDolarApi(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/euros/oficial', {
      signal: AbortSignal.timeout(8000),
      headers: JSON_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = await res.json();
    const value = data?.promedio || data?.venta || data?.compra;
    if (!value || value <= 0) return null;
    if (isStale(data.fechaActualizacion)) return null;

    return { rate: value, date: data.fechaActualizacion || '' };
  } catch {
    return null;
  }
}

async function eurFromPydolarve(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch('https://pydolarve.org/api/v2/euro?page=bcv', {
      signal: AbortSignal.timeout(8000),
      headers: JSON_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const eur = (await res.json())?.monitors?.eur;
    if (!eur?.price || eur.price <= 0) return null;
    if (isStale(eur.last_update)) return null;

    return { rate: eur.price, date: eur.last_update || '' };
  } catch {
    return null;
  }
}

// ─── Resolución ───────────────────────────────────────────────────────────

const buildLabel = (s: string) =>
  s === 'bcv.org.ve'
    ? 'BCV Oficial'
    : s === 'dolarapi.com'
      ? 'BCV Oficial (vía DolarAPI)'
      : s === 'pydolarve.org'
        ? 'BCV Oficial (vía PyDolarVe)'
        : s === 'currency-api'
          ? 'Tasa aproximada (Currency API)'
          : 'BCV';

async function resolveRates(): Promise<BcvRates> {
  // El HTML del BCV se baja UNA vez y alimenta las dos monedas.
  const html = await fetchBcvHtml();

  // ── USD: BCV → dolarapi → pydolarve → currency-api ──────────────────────
  let rate: number | null = html ? parseBcvHtml(html, 'dolar') : null;
  let dateStr = '';
  let source = rate ? 'bcv.org.ve' : 'none';

  if (!rate) {
    const fromMirror = (await usdFromDolarApi()) ?? (await usdFromPydolarve());
    if (fromMirror) {
      rate = fromMirror.rate;
      dateStr = fromMirror.date;
      source = 'dolarapi.com';
    }
  }

  if (!rate) {
    // Último recurso y NO es la tasa del BCV: es de mercado. Por eso se rotula
    // distinto — servirla como "BCV Oficial" sería el mismo defecto que se vino
    // a corregir.
    const approx = await usdFromCurrencyApi();
    if (approx) {
      rate = approx.rate;
      dateStr = approx.date;
      source = 'currency-api';
    }
  }

  // ── EUR: mismo orden ────────────────────────────────────────────────────
  let eurRate: number | null = html ? parseBcvHtml(html, 'euro') : null;
  let eurDateStr = '';
  let eurSource = eurRate ? 'bcv.org.ve' : 'none';

  if (!eurRate) {
    const fromMirror = (await eurFromDolarApi()) ?? (await eurFromPydolarve());
    if (fromMirror) {
      eurRate = fromMirror.rate;
      eurDateStr = fromMirror.date;
      eurSource = 'dolarapi.com';
    }
  }

  if (rate && rate > 0) {
    if (!dateStr) {
      dateStr = new Date().toLocaleDateString('es-VE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    return {
      // USD (compat retro: campos `rate`, `date`, `source`)
      rate,
      date: `${buildLabel(source)} — ${dateStr}`,
      source,
      // EUR
      eur_rate: eurRate,
      eur_date: eurRate ? `${buildLabel(eurSource)} — ${eurDateStr || dateStr}` : '',
      eur_source: eurSource,
    };
  }

  return {
    rate: null,
    date: '',
    source: 'none',
    eur_rate: eurRate,
    eur_date: eurRate ? `${buildLabel(eurSource)} — ${eurDateStr}` : '',
    eur_source: eurSource,
    message: 'No se pudo obtener la tasa BCV USD automáticamente.',
  };
}

/**
 * Tasas vigentes del BCV, con caché en proceso.
 *
 * La llaman la ruta `/api/admin/bcv-rate`, la reserva pública y el PDF de
 * presupuestos. NUNCA lanza: si todo falla devuelve `rate: null` y un `message`.
 */
export async function fetchBcvRates(): Promise<BcvRates> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;

  const payload = await resolveRates();

  // Solo se cachea un resultado ÚTIL. Guardar un fallo dejaría la app sin tasa
  // durante una hora entera por un tropiezo de red de un segundo.
  if (payload.rate && payload.rate > 0) {
    cache = { payload, at: Date.now() };
    return payload;
  }

  // Falló ahora, pero si hay algo cacheado sirve — con su fecha, que es vieja.
  // Mejor una tasa del BCV con fecha visible que ninguna.
  return cache?.payload ?? payload;
}
