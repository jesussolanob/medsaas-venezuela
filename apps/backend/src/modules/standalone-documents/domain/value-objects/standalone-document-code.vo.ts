/**
 * StandaloneDocumentCode value object.
 *
 * Format: {PREFIX}-YYYYMM-NNNN+  (e.g. REC-202610-0001)
 *   PREFIX: 'REC' (recipe) | 'PAR' (paraclinical) | 'REP' (reposo)
 *   YYYYMM: year + month in America/Caracas timezone
 *   NNNN+:  sequence per doctor per month, zero-padded to min 4 digits
 *
 * Month is computed in Venezuela local time (UTC-4, no DST since May 2016).
 * A document created at 2026-10-01T02:00:00Z belongs to month 202609 in UTC
 * but 202609 in Caracas (UTC-4 = 22:00 the previous day in Caracas,
 * so it IS September in Caracas). Using Caracas time prevents codes like
 * "REC-202611-0001" for a document created just after midnight UTC on
 * the first of the month.
 *
 * Uniqueness is (doctor_id, code) — enforced by DB UNIQUE constraint.
 * Sequence is per-doctor, per-month (mirrors ConsultationCode pattern).
 * Retry-on-conflict is handled in the repository.
 *
 * This VO is intentionally NOT parametrized from ConsultationCode to avoid
 * touching code with 100% coverage (owner rule: "no tocar lo ya desarrollado").
 */

export type StandaloneDocumentCodePrefix = 'REC' | 'PAR' | 'REP';

/** Venezuela is UTC-4, no DST */
const VENEZUELA_UTC_OFFSET_HOURS = 4;

export class StandaloneDocumentCode {
  private constructor(public readonly value: string) {}

  /**
   * Generates a code from the document type, the reference date (UTC), and a
   * per-doctor per-month sequence number.
   *
   * @param prefix   - 'REC' | 'PAR' | 'REP'
   * @param utcDate  - reference date in UTC (used for YYYYMM in Caracas time)
   * @param sequence - 1-based integer for this doctor+month
   */
  static generate(
    prefix: StandaloneDocumentCodePrefix,
    utcDate: Date,
    sequence: number,
  ): StandaloneDocumentCode {
    const caracasMs = utcDate.getTime() - VENEZUELA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
    const caracasDate = new Date(caracasMs);
    const year = caracasDate.getUTCFullYear();
    const month = String(caracasDate.getUTCMonth() + 1).padStart(2, '0');
    const seq = String(sequence).padStart(4, '0');
    return new StandaloneDocumentCode(`${prefix}-${year}${month}-${seq}`);
  }

  /**
   * Extracts the YYYYMM segment from a reference UTC date, converted to
   * Caracas local time. Used to derive the month key for sequence management.
   */
  static toCaracasYearMonth(utcDate: Date): string {
    const caracasMs = utcDate.getTime() - VENEZUELA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
    const d = new Date(caracasMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }

  /**
   * Returns true for REC/PAR/REP-YYYYMM-NNNN+ format.
   */
  static isValid(code: string): boolean {
    return /^(REC|PAR|REP)-\d{6}-\d{4,}$/.test(code);
  }

  toString(): string {
    return this.value;
  }
}
