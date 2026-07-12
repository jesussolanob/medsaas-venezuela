/**
 * lib/date-validation.ts
 *
 * Helpers de validación de fechas para formularios (fecha de nacimiento, etc.).
 *
 * Todas las comparaciones usan strings 'YYYY-MM-DD', cuyo orden lexicográfico
 * coincide con el cronológico. La fecha "hoy" se calcula en zona horaria de
 * Venezuela (America/Caracas, UTC-4 sin horario de verano) para que la validación
 * sea consistente sin importar la zona del navegador.
 */

/** Hoy como 'YYYY-MM-DD' en America/Caracas. */
export function todayCaracasISO(): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Fecha máxima de nacimiento (YYYY-MM-DD) para cumplir una edad mínima.
 * Ej: minAge=18 y hoy=2026-07-12 → '2008-07-12'. Nacer después de esa fecha
 * implica ser menor de 18.
 */
export function maxBirthDateForMinAge(minAge: number): string {
  const [y, m, d] = todayCaracasISO().split('-').map(Number);
  return `${y - minAge}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Valida una fecha de nacimiento 'YYYY-MM-DD'.
 * - Vacía → válida (el campo puede ser opcional).
 * - Futura → error.
 * - Con minAge > 0 → debe cumplir al menos esa edad.
 *
 * @returns mensaje de error en español, o null si es válida.
 */
export function validateBirthDate(
  dateStr: string | null | undefined,
  opts: { minAge?: number } = {},
): string | null {
  if (!dateStr) return null;
  const today = todayCaracasISO();
  if (dateStr > today) {
    return 'La fecha de nacimiento no puede ser futura';
  }
  const minAge = opts.minAge ?? 0;
  if (minAge > 0 && dateStr > maxBirthDateForMinAge(minAge)) {
    return `Debe ser mayor de ${minAge} años`;
  }
  return null;
}
