/**
 * Name matching utilities for credential verification.
 *
 * Names from SACS and from the doctor's profile may differ in:
 *   - Accents (José vs JOSE)
 *   - Word order (Apellido Nombre vs Nombre Apellido)
 *   - Middle names / compound surnames
 *   - Abbreviations
 *
 * Strategy: tokenize both names, normalize (strip accents, uppercase),
 * and require that every token from the shorter name appears in the longer one.
 * The overlap ratio must meet a minimum threshold.
 *
 * SECURITY: callers must not log any of the names passed to these functions.
 */

const ACCENT_MAP: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  Á: 'A',
  É: 'E',
  Í: 'I',
  Ó: 'O',
  Ú: 'U',
  ü: 'u',
  Ü: 'U',
  ñ: 'n',
  Ñ: 'N',
};

/** Minimum token-overlap ratio to consider names a match. */
export const NAME_MATCH_THRESHOLD = 0.5;

/**
 * Strips diacritical marks and normalises to uppercase.
 */
export function normalizeNameStr(name: string): string {
  return name
    .toUpperCase()
    .replace(/[áéíóúÁÉÍÓÚüÜñÑ]/g, (c) => ACCENT_MAP[c] ?? c)
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes a normalized name into non-empty words.
 */
export function tokenizeName(normalized: string): string[] {
  return normalized.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Returns true when the two names are considered a match.
 *
 * Algorithm:
 *   1. Normalize and tokenize both names.
 *   2. Count how many tokens from the shorter set appear in the longer set.
 *   3. Compute overlap = matching / shorter.length.
 *   4. Return overlap >= NAME_MATCH_THRESHOLD.
 */
export function namesMatch(nameA: string, nameB: string): boolean {
  const tokensA = tokenizeName(normalizeNameStr(nameA));
  const tokensB = tokenizeName(normalizeNameStr(nameB));

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  const longerSet = new Set(longer);
  const matchingCount = shorter.filter((t) => longerSet.has(t)).length;

  return matchingCount / shorter.length >= NAME_MATCH_THRESHOLD;
}

/** Returns true when the profession string suggests a medical doctor. */
export function isMedicalProfession(profesion: string): boolean {
  const normalized = normalizeNameStr(profesion);
  return normalized.includes('MEDICO') || normalized.includes('MEDICA');
}
