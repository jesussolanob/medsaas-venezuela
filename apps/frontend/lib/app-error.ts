import type { AppError } from './api-client.server';

/**
 * Converts a BFF AppError into a user-facing string.
 *
 * Shared helper. Lives in a plain module (NOT a 'use server' file) because
 * Next.js 16 forbids non-async function declarations inside 'use server'
 * modules — server actions may only export async functions.
 */
export function appErrorToString(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}
