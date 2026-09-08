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
