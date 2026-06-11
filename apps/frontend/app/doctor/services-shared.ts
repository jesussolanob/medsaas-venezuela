/**
 * app/doctor/services-shared.ts
 *
 * Plain (no 'use server') module that holds the BackendServiceRaw shape,
 * the normalised DoctorService contract, and the synchronous mapper between
 * them.  Kept separate so it can be imported from 'use server' modules
 * (which may only export async functions) and from client components alike.
 */

/** Shape the NestJS backend actually serialises (camelCase). */
export interface BackendServiceRaw {
  id: string;
  doctorId: string;
  officeId: string | null;
  name: string;
  priceUsd: number;
  durationMinutes: number;
  sessionsCount: number | null;
  isActive: boolean;
  showInBooking: boolean;
  description: string | null;
  type: 'plan' | 'service';
  createdAt: string;
  updatedAt: string;
}

/** Normalised shape consumed by all frontend features (snake_case contract). */
export interface DoctorService {
  id: string;
  name: string;
  /** UUID of the linked office, or null for general (all offices). */
  office_id: string | null;
  price_usd: number;
  duration_minutes: number;
  sessions_count: number;
  is_active: boolean;
  show_in_booking: boolean;
  description: string;
  type: 'plan' | 'service';
}

/** Maps the raw camelCase backend object to the normalised DoctorService shape. */
export function mapDoctorService(raw: BackendServiceRaw): DoctorService {
  return {
    id: raw.id,
    name: raw.name,
    office_id: raw.officeId ?? null,
    price_usd: raw.priceUsd ?? 0,
    duration_minutes: raw.durationMinutes ?? 30,
    sessions_count: raw.sessionsCount ?? 1,
    is_active: raw.isActive ?? true,
    show_in_booking: raw.showInBooking ?? true,
    description: raw.description ?? '',
    type: raw.type ?? 'plan',
  };
}
