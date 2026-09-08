/**
 * Vigencia de un presupuesto: la pantalla la pide en DÍAS, la API la guarda como
 * FECHA (`valid_until`, formato `YYYY-MM-DD`).
 *
 * Vive en su propio archivo porque lo usan las dos pantallas que editan la
 * vigencia — el modal de alta y el detalle. Dos copias de aritmética de fechas
 * terminan divergiendo, y acá una diferencia de un día cambia cuándo vence un
 * presupuesto y cuándo sale el recordatorio.
 *
 * Por qué días y no un calendario: la vigencia se piensa como "vale un mes", no
 * como "vale hasta el 8 de octubre". La fecha se deriva sola.
 */

/** Días de validez con los que se prellena un presupuesto nuevo. */
export const DEFAULT_VALIDITY_DAYS = '30';

/** Tope de días de validez. Evita fechas absurdas por un tecleo (99999 días). */
export const MAX_VALIDITY_DAYS = 365;

/**
 * Fecha de HOY + `days` en formato `YYYY-MM-DD`, que es lo que espera la API.
 *
 * ⚠️ Deliberadamente NO usa `toISOString()`: eso da la fecha en UTC, y Venezuela
 * va 4 horas atrás. Después de las 20:00 en Caracas el UTC ya es el día
 * siguiente, así que un presupuesto cargado hoy a la noche quedaría fechado
 * MAÑANA — y con 30 días de vigencia vencería un día tarde.
 *
 * También evita `setMonth()`: sumar un mes con esa API se desborda cuando el día
 * no existe en el mes destino (31 de enero + 1 mes = 3 de marzo). Sumar días con
 * `setDate()` es seguro — el motor normaliza el desborde de mes y de año solo.
 */
export function addDaysLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Días tecleados → fecha a guardar. `null` cuando el campo quedó vacío (elección
 * válida: no vence) o cuando lo tecleado no sirve.
 *
 * ⚠️ Un `null` acá NO distingue "vacío" de "inválido" — para eso está
 * {@link isValidityInvalid}. Guardar el `null` de un 400 tecleado significaría
 * "no vence nunca", justo lo contrario de lo que se quiso pedir.
 */
export function validityDaysToDate(raw: string): string | null {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_VALIDITY_DAYS) return null;
  return addDaysLocal(n);
}

/** true cuando se tecleó algo que no sirve. Vacío NO es inválido: es "no vence". */
export function isValidityInvalid(raw: string): boolean {
  return raw.trim() !== '' && validityDaysToDate(raw) === null;
}

/**
 * Fecha guardada → días que faltan desde hoy, para poder editar en días un
 * presupuesto que ya existe. Cadena vacía cuando no hay fecha.
 *
 * Un presupuesto YA VENCIDO devuelve '' y no '0' ni un negativo: el campo pide
 * cuántos días vale de acá en adelante, y "menos tres días" no es una respuesta
 * que se pueda guardar.
 */
export function dateToValidityDays(fecha: string | null): string {
  if (!fecha) return '';
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  const hoy = new Date();
  const objetivo = new Date(anio, mes - 1, dia);
  // Ambas fechas a medianoche local antes de restar: sin esto, la hora del día
  // en curso convierte la diferencia en un número roto (29,6 días → 29).
  hoy.setHours(0, 0, 0, 0);
  objetivo.setHours(0, 0, 0, 0);
  const dias = Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
  return dias > 0 ? String(dias) : '';
}

/** "8 de octubre de 2026" a partir de un `YYYY-MM-DD`, para confirmar en pantalla. */
export function formatVencimiento(fecha: string): string {
  // Se parte el string a mano en vez de `new Date('YYYY-MM-DD')`: ese formato lo
  // interpreta el motor como MEDIANOCHE UTC, que en Caracas es el día anterior a
  // las 20:00 — la fecha mostrada saldría corrida un día hacia atrás.
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
