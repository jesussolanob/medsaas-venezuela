import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BcvRateFetcher, parseBcvHtml } from './bcv-rate.fetcher';

/**
 * Fixture de HTML REAL de www.bcv.org.ve, recortado alrededor del bloque
 * `id="dolar"` y bajado el 2026-09-13 (Fecha Valor: 15 de septiembre, 842,2067).
 *
 * Se guarda el HTML de verdad y no uno inventado a proposito: el parser existe
 * para sobrevivir al markup del BCV, y un fixture escrito a mano solo probaria
 * que el regex entiende lo que YO creo que el BCV emite.
 */
const HTML_REAL = readFileSync(join(__dirname, '__fixtures__', 'bcv-home.html'), 'utf8');

/** Tasa que trae el fixture. */
const TASA_DEL_BCV = 842.2067;

describe('parseBcvHtml', () => {
  it('extrae la tasa del HTML real del BCV', () => {
    expect(parseBcvHtml(HTML_REAL)).toBeCloseTo(TASA_DEL_BCV, 4);
  });

  it('interpreta el punto como separador de miles y la coma como decimal', () => {
    expect(parseBcvHtml('<div id="dolar"><strong>1.234,56</strong></div>')).toBeCloseTo(1234.56, 2);
  });

  it('cae al patron por USD cuando no existe el bloque id="dolar"', () => {
    expect(parseBcvHtml('<td>USD</td><td><strong>842,20</strong></td>')).toBeCloseTo(842.2, 2);
  });

  it('devuelve null si el BCV rediseña la pagina y el patron ya no aparece', () => {
    // Es la falla que importa: mejor null -y que la cadena siga a los espejos-
    // que un numero inventado.
    expect(parseBcvHtml('<html><body>mantenimiento</body></html>')).toBeNull();
  });

  it('devuelve null ante un valor no numerico o cero', () => {
    expect(parseBcvHtml('<div id="dolar"><strong>0,00</strong></div>')).toBeNull();
    expect(parseBcvHtml('<div id="dolar"><strong>,,,</strong></div>')).toBeNull();
  });

  it('devuelve null con HTML vacio', () => {
    expect(parseBcvHtml('')).toBeNull();
  });
});

describe('BcvRateFetcher', () => {
  let fetcher: BcvRateFetcher;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    fetcher = new BcvRateFetcher();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Respuesta del sitio del BCV (HTML). */
  const bcvSiteOk = (html: string = HTML_REAL) => ({
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(html),
  });

  /** Espejo dolarapi. Por defecto con fecha de hoy, que es lo que se acepta. */
  const dolarApiOk = (promedio: unknown, fechaActualizacion = new Date().toISOString()) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ promedio, fechaActualizacion }),
  });

  /** Espejo pydolarve. */
  const pydolarOk = (price: unknown) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ price }),
  });

  const errorResponse = () => ({
    ok: false,
    status: 500,
    json: jest.fn().mockResolvedValue({}),
    text: jest.fn().mockResolvedValue(''),
  });

  // ── Orden de la cadena ────────────────────────────────────────────────────
  //
  // El BCV va PRIMERO. Antes se consultaba dolarapi primero y el 2026-09-13
  // devolvia 832,4883 con fecha del 11/09 mientras el BCV publicaba 842,2067.

  it('consulta el sitio del BCV primero y devuelve su tasa', async () => {
    mockFetch.mockResolvedValueOnce(bcvSiteOk());

    await expect(fetcher.fetchRate()).resolves.toBeCloseTo(TASA_DEL_BCV, 4);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('bcv.org.ve');
  });

  it('pasa a dolarapi cuando el sitio del BCV responde con error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse()).mockResolvedValueOnce(dolarApiOk(37.0));

    await expect(fetcher.fetchRate()).resolves.toBe(37.0);

    const [segunda] = mockFetch.mock.calls[1] as [string];
    expect(segunda).toContain('dolarapi.com');
  });

  it('pasa a pydolarve cuando el BCV y dolarapi fallan', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(pydolarOk(36.0));

    await expect(fetcher.fetchRate()).resolves.toBe(36.0);

    const [tercera] = mockFetch.mock.calls[2] as [string];
    expect(tercera).toContain('pydolarve.org');
  });

  it('pasa al espejo cuando el HTML del BCV no se puede parsear', async () => {
    mockFetch
      .mockResolvedValueOnce(bcvSiteOk('<html>sin la tasa</html>'))
      .mockResolvedValueOnce(dolarApiOk(38.0));

    await expect(fetcher.fetchRate()).resolves.toBe(38.0);
  });

  // ── Validacion por fecha del espejo ───────────────────────────────────────

  it('descarta la tasa de dolarapi si su fecha es vieja y sigue a pydolarve', async () => {
    const hace10Dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(dolarApiOk(832.4883, hace10Dias))
      .mockResolvedValueOnce(pydolarOk(842.2));

    // El caso real: el espejo devolvia un dato viejo y se servia como del dia.
    await expect(fetcher.fetchRate()).resolves.toBe(842.2);
  });

  it('acepta la tasa de dolarapi con pocos dias: el BCV no publica findes', async () => {
    const hace2Dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(dolarApiOk(840, hace2Dias));

    await expect(fetcher.fetchRate()).resolves.toBe(840);
  });

  it('acepta la tasa si el espejo no declara fecha', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ promedio: 840 }),
    });

    // Descartar por falta de fecha dejaria la cadena sin respaldo.
    await expect(fetcher.fetchRate()).resolves.toBe(840);
  });

  it('acepta la tasa si la fecha del espejo es ilegible', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(dolarApiOk(840, 'no-es-una-fecha'));

    await expect(fetcher.fetchRate()).resolves.toBe(840);
  });

  // ── Valores invalidos y fallos (cobertura heredada del spec original) ─────

  it('pasa a pydolarve cuando el promedio de dolarapi no es un numero', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(dolarApiOk('not-a-number'))
      .mockResolvedValueOnce(pydolarOk(38.0));

    await expect(fetcher.fetchRate()).resolves.toBe(38.0);
  });

  it('pasa a pydolarve cuando falta el promedio', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce(pydolarOk(35.0));

    await expect(fetcher.fetchRate()).resolves.toBe(35.0);
  });

  it('devuelve null cuando el promedio es cero o negativo y pydolarve falla', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(dolarApiOk(0))
      .mockResolvedValueOnce(errorResponse());

    await expect(fetcher.fetchRate()).resolves.toBeNull();
  });

  it('devuelve null cuando el price de pydolarve es cero o negativo', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(pydolarOk(-5));

    await expect(fetcher.fetchRate()).resolves.toBeNull();
  });

  it('devuelve null cuando las tres fuentes fallan', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(errorResponse());

    await expect(fetcher.fetchRate()).resolves.toBeNull();
  });

  it('devuelve null cuando las tres lanzan: NUNCA propaga la excepcion', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('bcv caido'))
      .mockRejectedValueOnce(new Error('err1'))
      .mockRejectedValueOnce(new Error('err2'));

    await expect(fetcher.fetchRate()).resolves.toBeNull();
  });

  it('sigue adelante cuando solo el sitio del BCV lanza', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(dolarApiOk(36.5));

    await expect(fetcher.fetchRate()).resolves.toBe(36.5);
  });
});
