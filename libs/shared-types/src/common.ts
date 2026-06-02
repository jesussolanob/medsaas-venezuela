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
