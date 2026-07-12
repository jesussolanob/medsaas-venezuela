'use server';

/**
 * app/doctor/offices/actions.ts
 *
 * Server actions para la gestión de consultorios del doctor.
 * ETAPA 1 — thin-proxy al módulo NestJS `offices` vía el BFF server-only.
 * Sin Supabase. La identidad (doctor_id) la resuelve el backend desde dev-auth
 * (user.sub) — el cliente nunca envía doctor_id (anti-IDOR).
 */

import {
  backendGet,
  backendPost,
  backendPut,
  backendDelete,
  backendFetch,
} from '@/lib/api-client.server';

export interface OfficeDay {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
}

export type OfficeModality = 'in_person' | 'online' | 'both';

/** Forma que consume la UI (snake_case, igual que el tipo Office del page). */
export interface OfficeView {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  map_url?: string | null;
  is_active: boolean;
  schedule: OfficeDay[];
  slot_duration: number;
  buffer_minutes: number;
  modality: OfficeModality;
}

/** Respuesta camelCase del backend. */
interface BackendOffice {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  mapUrl?: string | null;
  isActive: boolean;
  schedule: OfficeDay[];
  slotDuration: number;
  bufferMinutes: number;
  modality?: OfficeModality;
}

export interface OfficeInput {
  name: string;
  address: string;
  city: string;
  phone: string;
  map_url?: string;
  schedule: OfficeDay[];
  slot_duration: number;
  buffer_minutes: number;
  modality: OfficeModality;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

function toView(o: BackendOffice): OfficeView {
  return {
    id: o.id,
    name: o.name,
    address: o.address,
    city: o.city,
    phone: o.phone,
    map_url: o.mapUrl ?? null,
    is_active: o.isActive,
    schedule: o.schedule ?? [],
    slot_duration: o.slotDuration,
    buffer_minutes: o.bufferMinutes,
    modality: o.modality ?? 'in_person',
  };
}

/** Lista los consultorios del doctor autenticado. */
export async function listOffices(): Promise<OfficeView[]> {
  const result = await backendGet<BackendOffice[]>('/api/doctor/offices');
  if (!result.ok) return [];
  return result.value.map(toView);
}

/** Crea un consultorio. */
export async function createOffice(input: OfficeInput): Promise<MutationResult> {
  const result = await backendPost<BackendOffice>('/api/doctor/offices', input);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** Actualiza un consultorio (ownership en el backend). */
export async function updateOffice(id: string, input: OfficeInput): Promise<MutationResult> {
  const result = await backendPut<BackendOffice>(`/api/doctor/offices/${id}`, input);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** Elimina un consultorio. */
export async function deleteOffice(id: string): Promise<MutationResult> {
  const result = await backendDelete<unknown>(`/api/doctor/offices/${id}`);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** Alterna el estado activo/inactivo de un consultorio. */
export async function toggleOffice(id: string): Promise<MutationResult> {
  const result = await backendFetch<BackendOffice>(`/api/doctor/offices/${id}/toggle`, {
    method: 'PATCH',
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}
