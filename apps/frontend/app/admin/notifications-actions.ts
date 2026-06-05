'use server';

/**
 * app/admin/notifications-actions.ts
 *
 * Server action para el bell de notificaciones admin.
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (`GET /api/admin/doctors/recent`).
 * Sin Supabase. RBAC (super_admin) lo aplica el backend.
 */

import { backendGet } from '@/lib/api-client.server';

interface BackendRecentDoctor {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface RecentDoctorView {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

/** Médicos registrados en los últimos `days` días (para el bell de notificaciones). */
export async function getRecentDoctors(days = 7): Promise<RecentDoctorView[]> {
  const result = await backendGet<BackendRecentDoctor[]>(`/api/admin/doctors/recent?days=${days}`);
  if (!result.ok) return [];
  return result.value.map((d) => ({
    id: d.id,
    full_name: d.fullName,
    email: d.email,
    created_at: d.createdAt,
  }));
}
