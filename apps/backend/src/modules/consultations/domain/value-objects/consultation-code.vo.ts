/**
 * ConsultationCode value object.
 *
 * Format: DLT-YYYYMM-NNNN+  (e.g. DLT-202606-0042, DLT-202606-10000)
 *   - DLT: fixed prefix
 *   - YYYYMM: year + month of the consultation
 *   - NNNN+: sequence number, zero-padded to a minimum of 4 digits
 *
 * Consistency rule: generate() pads to at least 4 digits (sequences 1-9999
 * produce exactly 4 digits). Sequences ≥10000 produce 5+ digits without
 * truncation. isValid() accepts 4-or-more digits to stay coherent with what
 * generate() can produce.
 *
 * Sequence numbers are managed externally (by the repository) to ensure
 * uniqueness. This VO only validates format and provides the factory method.
 */
export class ConsultationCode {
  private constructor(public readonly value: string) {}

  /**
   * Generates a ConsultationCode from a date and a per-month sequence number.
   *
   * @param date - the consultation date (used to extract YYYYMM)
   * @param sequence - 1-based integer for this month (e.g. 42 → "0042", 10000 → "10000")
   */
  static generate(date: Date, sequence: number): ConsultationCode {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    // Minimum 4-digit pad; sequences >=10000 are not truncated.
    const seq = String(sequence).padStart(4, '0');
    return new ConsultationCode(`DLT-${year}${month}-${seq}`);
  }

  /**
   * Returns true when the given string matches the DLT-YYYYMM-NNNN+ format.
   * Accepts 4 or more digits in the sequence segment, consistent with generate().
   */
  static isValid(code: string): boolean {
    return /^DLT-\d{6}-\d{4,}$/.test(code);
  }

  toString(): string {
    return this.value;
  }
}
