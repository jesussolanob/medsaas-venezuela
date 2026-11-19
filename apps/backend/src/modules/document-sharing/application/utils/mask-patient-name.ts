/**
 * Masks a patient's full name for patient-facing display.
 *
 * Shows the first name and the initial of the last name to avoid
 * exposing the full name in a low-trust context (e.g. the verify-code
 * confirmation screen shown to the patient who just authenticated).
 *
 * Examples:
 *   "María Rodríguez García" → "María R."
 *   "Carlos"                 → "Carlos"
 *   "  "                     → "---"
 *
 * NEVER log the input — it is decrypted PII.
 */
export function maskPatientName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0];
  if (!first) return '---';
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const lastInitial = lastPart ? ` ${lastPart[0]}.` : '';
  return `${first}${lastInitial}`;
}
