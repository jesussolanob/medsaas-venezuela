'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/services/actions.ts
 *
 * Server Actions for the doctor services (pricing plans) module.
 * ETAPA 1 — thin-proxy to NestJS /api/doctor/services.
 *
 * Backend endpoints:
 *   GET    /api/doctor/services        → list all pricing plans
 *   POST   /api/doctor/services        → create a new plan
 *   PUT    /api/doctor/services/:id    → update a plan
 *   DELETE /api/doctor/services/:id    → soft-delete a plan
 */

import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import {
  backendGet,
  backendPost,
  backendPut,
  backendDelete,
  type AppError,
} from '@/lib/api-client.server';
import type { DoctorService } from '@/app/doctor/actions';

// NOTE: do NOT re-export types from a 'use server' module (e.g. `export type { DoctorService }`).
// Next.js' server-action transform emits a runtime server-reference for every named export,
// which for an erased type becomes `ReferenceError: <Type> is not defined` at module eval
// (crashes any page importing from here). Consumers import DoctorService from '@/app/doctor/actions'.
export type ServiceActionResult =
  | { success: true; service?: DoctorService }
  | { success: false; error: string };


/** Fetch all pricing plans for the authenticated doctor. */
export async function getDoctorServices(): Promise<DoctorService[]> {
  const result = await backendGet<DoctorService[]>('/api/doctor/services');

  if (!result.ok) {
    log.error('[getDoctorServices] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/** Create a new pricing plan. */
export async function createDoctorService(input: {
  name: string;
  price_usd: number;
  duration_minutes: number;
  sessions_count: number;
  description?: string | null;
  type?: 'plan' | 'service';
  show_in_booking?: boolean;
}): Promise<ServiceActionResult> {
  const result = await backendPost<DoctorService>('/api/doctor/services', input);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/services');
  return { success: true, service: result.value };
}

/** Update a pricing plan. */
export async function updateDoctorService(
  id: string,
  fields: Partial<{
    name: string;
    price_usd: number;
    duration_minutes: number;
    sessions_count: number;
    description: string | null;
    type: 'plan' | 'service';
    show_in_booking: boolean;
    is_active: boolean;
  }>,
): Promise<ServiceActionResult> {
  const result = await backendPut<DoctorService>(`/api/doctor/services/${id}`, fields);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/services');
  return { success: true, service: result.value };
}

/** Soft-delete a pricing plan. */
export async function deleteDoctorService(id: string): Promise<ServiceActionResult> {
  const result = await backendDelete<null>(`/api/doctor/services/${id}`);

  if (!result.ok) {
    return { success: false, error: appErrorToString(result.error) };
  }

  revalidatePath('/doctor/services');
  return { success: true };
}

/** Toggle show_in_booking or is_active on a pricing plan. */
export async function toggleDoctorService(
  id: string,
  field: 'show_in_booking' | 'is_active',
  value: boolean,
): Promise<ServiceActionResult> {
  return updateDoctorService(id, { [field]: value });
}
