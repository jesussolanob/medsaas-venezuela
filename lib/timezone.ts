/**
 * lib/timezone.ts — utilidades de fecha forzando zona horaria de Venezuela.
 *
 * Por que existe: `Date.getDate()`, `Date.getHours()`, etc. devuelven valores
 * en la zona horaria del NAVEGADOR. Si el navegador del doctor estuviera en
 * UTC o en una zona distinta, una cita guardada como "2026-04-26T01:00:00Z"
 * (sábado en UTC) podria mostrarse como "viernes 25" en su navegador.
 *
 * Aqui forzamos siempre America/Caracas (UTC-4, sin DST) usando Intl que es
 * nativo de JS — no necesitamos date-fns-tz.
 */

export const VE_TIMEZONE = 'America/Caracas'

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: VE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const hhmmFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: VE_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dayOfWeekFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: VE_TIMEZONE,
  weekday: 'short',
})

/**
 * Devuelve "YYYY-MM-DD" en zona horaria Caracas.
 * Acepta Date, string ISO o numero (timestamp).
 */
export function toLocalYMD(d: Date | string | number): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  // en-CA da formato YYYY-MM-DD por defecto
  return ymdFmt.format(date)
}

/**
 * Devuelve "HH:MM" (24h) en zona horaria Caracas.
 */
export function toLocalHHMM(d: Date | string | number): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  return hhmmFmt.format(date)
}

/**
 * Devuelve dia de la semana en formato ISO (1=lunes, 7=domingo) en zona Caracas.
 * Usa esta funcion en vez de `Date.getDay()` para evitar drift de timezone.
 */
export function toLocalISODay(d: Date | string | number): number {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return map[dayOfWeekFmt.format(date)] ?? 0
}

/**
 * Convierte una fecha YYYY-MM-DD + hora HH:MM (interpretadas como Caracas)
 * a un ISO string con offset -04:00 listo para guardar en Supabase.
 *
 * Caracas no tiene DST desde 2016, por eso el offset es siempre -04:00.
 */
export function caracasToISO(ymd: string, hhmm: string): string {
  // Construye un string ISO con offset explicito de Caracas.
  // Ej: '2026-04-26' + '09:30' -> '2026-04-26T09:30:00-04:00'
  return `${ymd}T${hhmm.length === 5 ? hhmm + ':00' : hhmm}-04:00`
}
