import * as https from 'https';
import { Injectable, Logger } from '@nestjs/common';
import type {
  IMppsVerificationPort,
  MppsVerificationResult,
  MppsProfessionEntry,
} from '../../domain/ports/mpps-verification.port';

const SACS_URL = 'https://sistemas.sacs.gob.ve/consultas/prfsnal_salud';
const TIMEOUT_MS = 8_000;

/**
 * Named HTML entities SACS embeds in text fields (Spanish accents + common
 * structural ones). SACS emits e.g. "M&Eacute;DICO(A) CIRUJANO(A)".
 */
const HTML_ENTITIES: Record<string, string> = {
  '&aacute;': 'á',
  '&eacute;': 'é',
  '&iacute;': 'í',
  '&oacute;': 'ó',
  '&uacute;': 'ú',
  '&Aacute;': 'Á',
  '&Eacute;': 'É',
  '&Iacute;': 'Í',
  '&Oacute;': 'Ó',
  '&Uacute;': 'Ú',
  '&ntilde;': 'ñ',
  '&Ntilde;': 'Ñ',
  '&uuml;': 'ü',
  '&Uuml;': 'Ü',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

/** Converts a Unicode code point to a string, ignoring out-of-range values. */
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return '';
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/**
 * Decodes the HTML entities SACS embeds in text fields (e.g. "M&Eacute;DICO").
 * Handles named Spanish entities plus decimal (&#233;) and hex (&#xE9;) forms.
 * Applied AFTER JSON.parse on individual field values, never on the whole XML,
 * so structural entities cannot corrupt the JSON. Pure, no side effects.
 */
function decodeHtmlEntities(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    if (out.includes(entity)) out = out.split(entity).join(char);
  }
  out = out.replace(/&#(\d+);/g, (_m, n: string) => safeFromCodePoint(parseInt(n, 10)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => safeFromCodePoint(parseInt(n, 16)));
  return out;
}

/**
 * SacsXajaxAdapter — infrastructure adapter implementing IMppsVerificationPort.
 *
 * Queries the Venezuelan SACS portal (xajax/PHP) to verify MPPS credentials.
 *
 * HOW IT WORKS:
 *   1. POST to SACS_URL with Content-Type: application/x-www-form-urlencoded.
 *      Body: xajax=getPrfsnalByCed&xajaxr=<timestamp_ms>&xajaxargs[]=V-<cedula>
 *   2. Response is an XML envelope containing JS callback calls:
 *        xajax_userTable('{"cedula":"...","nombre1":"...","apellido1":"..."}')
 *        xajax_tableProfesion('[{"licencia":"MPPS-65583","profesion":"M&Eacute;DICO...",...}]')
 *      NOTE: the professions array arrives in a SEPARATE xajax_tableProfesion
 *      call (NOT a second xajax_userTable), and text fields carry HTML entities
 *      (e.g. "M&Eacute;DICO"). Both facts must be handled or every match fails.
 *   3. Regex-extract the JSON argument from each call and decode HTML entities.
 *   4. Return a structured MppsVerificationResult.
 *
 * TLS: SACS cert is expired. A dedicated https.Agent({rejectUnauthorized:false})
 * is used ONLY for requests to this host. It is NEVER applied globally.
 *
 * SECURITY: This adapter MUST NOT log cedula, name, or MPPS numbers.
 *   Only structural diagnostics (response size, HTTP status) are logged.
 */
@Injectable()
export class SacsXajaxAdapter implements IMppsVerificationPort {
  private readonly logger = new Logger(SacsXajaxAdapter.name);

  /** Dedicated agent that bypasses TLS verification for SACS only. */
  private readonly sacsAgent = new https.Agent({ rejectUnauthorized: false });

  async queryByCedula(cedula: string): Promise<MppsVerificationResult> {
    const timestamp = Date.now();
    const body = this.buildRequestBody(cedula, timestamp);

    const rawXml = await this.postToSacs(body);

    return this.parseResponse(rawXml);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildRequestBody(cedula: string, timestamp: number): string {
    const prefix = cedula.toUpperCase().startsWith('E') ? 'E' : 'V';
    const digits = cedula.replace(/^[VEve]-?/, '');
    const encoded = encodeURIComponent(`${prefix}-${digits}`);
    return ['xajax=getPrfsnalByCed', `xajaxr=${timestamp}`, `xajaxargs[]=${encoded}`].join('&');
  }

  private postToSacs(body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(SACS_URL);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        agent: this.sacsAgent,
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          Accept: '*/*',
          'User-Agent': 'Mozilla/5.0',
        },
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          this.logger.debug(`[sacs] response status=${res.statusCode} size=${raw.length}`);
          resolve(raw);
        });
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`SACS request timed out after ${TIMEOUT_MS}ms`));
      });

      req.on('error', reject);

      req.write(body);
      req.end();
    });
  }

  private parseResponse(rawXml: string): MppsVerificationResult {
    // Personal data arrives in xajax_userTable('{...}'); professions arrive in a
    // SEPARATE xajax_tableProfesion('[...]') call. Extract each independently.
    const personalArg = this.extractXajaxArg(rawXml, 'xajax_userTable');

    if (personalArg === null) {
      this.logger.debug('[sacs] no xajax_userTable call found in response');
      return { found: false };
    }

    // Empty string or '""' means the cedula was not found.
    const trimmed = personalArg.trim().replace(/^"|"$/g, '');
    if (trimmed.length === 0 || trimmed === '""') {
      return { found: false };
    }

    let personData: Record<string, string> | null = null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        personData = parsed as Record<string, string>;
      }
    } catch {
      this.logger.warn('[sacs] failed to parse personal data JSON');
      return { found: false };
    }

    if (!personData) {
      return { found: false };
    }

    const nombre1 = decodeHtmlEntities(personData['nombre1'] ?? '');
    const apellido1 = decodeHtmlEntities(personData['apellido1'] ?? '');
    const name = `${nombre1} ${apellido1}`.trim().toUpperCase();

    // Professions come from xajax_tableProfesion('[...]') — a distinct call.
    const professionsArg = this.extractXajaxArg(rawXml, 'xajax_tableProfesion');
    let professions: MppsProfessionEntry[] = [];

    if (professionsArg !== null && professionsArg.trim().length > 0) {
      try {
        const rawArr: unknown = JSON.parse(professionsArg.trim());
        if (Array.isArray(rawArr)) {
          professions = (rawArr as Record<string, string>[]).map((item) => ({
            licencia: decodeHtmlEntities(String(item['licencia'] ?? '')),
            profesion: decodeHtmlEntities(String(item['profesion'] ?? '')),
            fechaRegistro: String(item['fecha_registro'] ?? ''),
            tomoRegistro: String(item['tomo_registro'] ?? ''),
            folioRegistro: String(item['folio_registro'] ?? ''),
          }));
        }
      } catch {
        this.logger.warn('[sacs] failed to parse professions JSON');
      }
    }

    return { found: true, name, professions };
  }

  /**
   * Extracts the single- or double-quoted argument of the first
   * `<fnName>('<arg>')` call in the raw xajax XML. Returns null when absent.
   */
  private extractXajaxArg(rawXml: string, fnName: string): string | null {
    const re = new RegExp(`${fnName}\\((['"])([\\s\\S]*?)\\1\\)`);
    const m = rawXml.match(re);
    return m ? (m[2] ?? '') : null;
  }
}
