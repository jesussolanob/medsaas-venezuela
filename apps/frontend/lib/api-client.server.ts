// Prevents this module from being imported in 'use client' components or client
// bundles. Next.js throws a build-time error if the import is detected on the
// client side, protecting BACKEND_INTERNAL_URL and dev-auth headers from leaking.
import 'server-only';

/**
 * lib/api-client.server.ts
 *
 * BFF HTTP client — SERVER ONLY.
 *
 * Forwards requests from the Next.js layer to the NestJS backend.
 * Attaches dev-auth headers (Etapa 1). Parses the backend envelope
 * ({success,data} | {success:false,code,message}) into Result<T, AppError>.
 *
 * ETAPA 1: Uses DevAuthGuard headers (x-dev-user-id, x-dev-user-role).
 * ETAPA 2 (Fase 4): Replace getDevUser() with Auth0 JWT verification from
 *   httpOnly cookie; the rest of this module stays the same.
 *
 * Usage:
 *   import { backendFetch, backendGet, backendPost } from '@/lib/api-client.server'
 */

import type { Result } from '@delta/shared-types';
import { ok, err } from '@delta/shared-types';
import { resolveIdentity, UnauthenticatedError } from './identity.server';

// ---------------------------------------------------------------------------
// AppError — structured error type for the frontend layer
// ---------------------------------------------------------------------------

export interface AppError {
  /** Machine-readable code from the backend (e.g. 'PATIENT_NOT_FOUND'). */
  code: string;
  /** Human-readable message. */
  message: string;
  /** HTTP status from the backend response. */
  status: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /**
   * Override both userId AND role together (e.g. in tests / impersonation).
   * Partial overrides are intentionally disallowed: if only one field is
   * provided the override is ignored and the full dev-auth identity is used.
   * This prevents accidental hybrid combos like (test-uuid + dev-role).
   */
  userId?: string;
  role?: string;
}

/**
 * Core fetch wrapper. Attaches dev-auth headers, serializes the body,
 * and returns Result<T, AppError>.
 *
 * Identity resolution:
 *   - Both userId AND role present → use them (complete override).
 *   - Otherwise → read the full identity from getDevUser() (dev-auth stub).
 */
export async function backendFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<Result<T, AppError>> {
  const { body, userId, role, ...fetchOptions } = options;

  let resolvedId: string;
  let resolvedRole: string;

  if (userId && role) {
    // Complete override — used in tests or explicit impersonation.
    resolvedId = userId;
    resolvedRole = role;
  } else {
    // No override, or only partial — resolve identity per AUTH_MODE.
    // In dev mode: reads dev_user_id / dev_user_role cookies (same as before).
    // In auth0 mode: exchanges Auth0 session for backend profile UUID.
    try {
      const identity = await resolveIdentity();
      resolvedId = identity.id;
      resolvedRole = identity.role;
    } catch (error: unknown) {
      // No session (anonymous or expired Auth0 token) is an EXPECTED outcome
      // for unauthenticated hits to identity-gated BFF routes. Return a clean
      // 401 instead of letting the throw bubble to Next's onRequestError,
      // which would report it to Sentry as an unhandled 500 (noise).
      if (error instanceof UnauthenticatedError) {
        return err({ code: 'UNAUTHENTICATED', message: 'No autenticado', status: 401 });
      }
      // Any other failure (missing AUTH_RESOLVE_SECRET, resolve-identity 5xx)
      // is a REAL error — let it propagate so Sentry captures it.
      throw error;
    }
  }

  const url = `${BACKEND_URL}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-dev-user-id': resolvedId,
    'x-dev-user-role': resolvedRole,
    ...fetchOptions.headers,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError: unknown) {
    const message = networkError instanceof Error ? networkError.message : 'Network error';
    return err({ code: 'NETWORK_ERROR', message, status: 0 });
  }

  // Parse the response body once.
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return err({
      code: 'PARSE_ERROR',
      message: 'El servidor devolvió una respuesta no válida',
      status: response.status,
    });
  }

  if (!response.ok) {
    const error = json as { success?: false; code?: string; message?: string } | null;
    return err({
      code: error?.code ?? 'BACKEND_ERROR',
      message: error?.message ?? `Error ${response.status}`,
      status: response.status,
    });
  }

  // Successful envelope: { success: true, data: T, meta?: ... }
  const envelope = json as { success: true; data: T };
  return ok(envelope.data);
}

// ---------------------------------------------------------------------------
// Convenience wrappers per HTTP verb
// ---------------------------------------------------------------------------

/** GET /api/<path> */
export function backendGet<T>(
  path: string,
  options: Omit<FetchOptions, 'method' | 'body'> = {},
): Promise<Result<T, AppError>> {
  return backendFetch<T>(path, { ...options, method: 'GET' });
}

/** POST /api/<path> */
export function backendPost<T>(
  path: string,
  body: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {},
): Promise<Result<T, AppError>> {
  return backendFetch<T>(path, { ...options, method: 'POST', body });
}

/** PUT /api/<path> */
export function backendPut<T>(
  path: string,
  body: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {},
): Promise<Result<T, AppError>> {
  return backendFetch<T>(path, { ...options, method: 'PUT', body });
}

/** PATCH /api/<path> */
export function backendPatch<T>(
  path: string,
  body: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {},
): Promise<Result<T, AppError>> {
  return backendFetch<T>(path, { ...options, method: 'PATCH', body });
}

/** DELETE /api/<path> */
export function backendDelete<T>(
  path: string,
  options: Omit<FetchOptions, 'method' | 'body'> = {},
): Promise<Result<T, AppError>> {
  return backendFetch<T>(path, { ...options, method: 'DELETE' });
}
