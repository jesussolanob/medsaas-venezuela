import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive base schemas
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();

export const timestampsSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

// ---------------------------------------------------------------------------
// Venezuelan cédula — format V/E/P-<value> (V = venezolano, E = extranjero,
// P = pasaporte). Shared across doctor registration, patients, and quote
// recipients — reuse this schema instead of writing a new regex.
// ---------------------------------------------------------------------------

export const cedulaSchema = z
  .string()
  .trim()
  .regex(
    /^[VEP]-[A-Za-z0-9]{3,20}$/,
    'La cédula debe tener el formato V/E/P-<valor> (ej. V-12345678)',
  )
  .max(30, 'La cédula no puede tener más de 30 caracteres');

/**
 * Forma CANÓNICA en la que se guarda una cédula: `V-12345678`.
 *
 * Saca puntos, espacios y guiones de más, y pone el prefijo en mayúscula, de modo
 * que `v.12.345.678`, `V 12345678` y `V--12345678` terminan guardados idénticos.
 * Así el especialista puede tipear como quiera y en la base queda una sola forma.
 *
 * ⚠️ CONSERVA el guion estructural, y no es un detalle estético: `cedulaSchema`
 * lo exige (`/^[VEP]-.../`). Guardar `V12345678` haría fallar la validación en
 * cualquier pantalla que relea el valor y lo vuelva a enviar — editar un
 * paciente, sin ir más lejos.
 *
 * ⚠️ NO inventa el prefijo. Un valor sin `V/E/P` adelante se devuelve sin
 * prefijo: suponer la nacionalidad de alguien sería inventarle un dato.
 *
 * Es hermana de `normalizeCedulaForSearch` (@delta/shared-crypto), que hace lo
 * mismo pero SIN el guion, porque esa se usa para la huella de búsqueda y ahí
 * los separadores solo estorban. Las dos tienen que coincidir en qué consideran
 * "la misma cédula".
 */
export function toCanonicalCedula(raw: string): string {
  const limpia = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!limpia) return '';
  const prefijo = limpia.charAt(0);
  if (prefijo === 'V' || prefijo === 'E' || prefijo === 'P') {
    return `${prefijo}-${limpia.slice(1)}`;
  }
  return limpia;
}

// ---------------------------------------------------------------------------
// API response envelopes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T;
  meta: PaginatedMeta;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Result<T, E> — discriminated union for frontend error handling
// ---------------------------------------------------------------------------

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
