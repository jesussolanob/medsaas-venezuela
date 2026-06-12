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
 * SacsXajaxAdapter — infrastructure adapter implementing IMppsVerificationPort.
 *
 * Queries the Venezuelan SACS portal (xajax/PHP) to verify MPPS credentials.
 *
 * HOW IT WORKS:
 *   1. POST to SACS_URL with Content-Type: application/x-www-form-urlencoded.
 *      Body: xajax=getPrfsnalByCed&xajaxr=<timestamp_ms>&xajaxargs[]=V-<cedula>
 *   2. Response is an XML envelope containing JS callback calls:
 *        xajax_userTable('{"cedula":"...","nombre1":"...","apellido1":"..."}')
 *        xajax_userTable('[{"licencia":"MPPS-...","profesion":"..."}]')
 *   3. Regex-extract the JSON arguments from those calls.
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
    // Extract arguments from xajax_userTable('...') calls.
    // There are typically two calls:
    //   1st: single-object JSON with personal data
    //   2nd: array JSON with professional licenses
    const callMatches = [...rawXml.matchAll(/xajax_userTable\(('|")([\s\S]*?)\1\)/g)];

    if (callMatches.length === 0) {
      this.logger.debug('[sacs] no xajax_userTable calls found in response');
      return { found: false };
    }

    // The first match contains the personal data object.
    const firstArg = callMatches[0]?.[2] ?? '';

    // Empty string or '""' means the cedula was not found.
    const trimmed = firstArg.trim().replace(/^"|"$/g, '');
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

    const nombre1 = personData['nombre1'] ?? '';
    const apellido1 = personData['apellido1'] ?? '';
    const name = `${nombre1} ${apellido1}`.trim().toUpperCase();

    // The second match (if present) contains the professions array.
    const secondArg = callMatches[1]?.[2] ?? '';
    let professions: MppsProfessionEntry[] = [];

    if (secondArg.trim().length > 0) {
      try {
        const rawArr: unknown = JSON.parse(secondArg.trim());
        if (Array.isArray(rawArr)) {
          professions = (rawArr as Record<string, string>[]).map((item) => ({
            licencia: String(item['licencia'] ?? ''),
            profesion: String(item['profesion'] ?? ''),
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
}
