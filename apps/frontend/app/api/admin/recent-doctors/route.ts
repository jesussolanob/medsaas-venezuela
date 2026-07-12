import 'server-only';

/**
 * GET /api/admin/recent-doctors?days=7
 *
 * Thin-proxy autenticado → NestJS `GET /api/admin/doctors/recent?days=`.
 * Lo consume el bell de notificaciones del admin (AdminNotifications), que hace
 * polling cada 60s. Reemplaza a la Server Action `getRecentDoctors`: los IDs de
 * Server Action se rehashean en cada build, así que una pestaña de admin abierta
 * con el build anterior lanzaba miles de `UnrecognizedActionError: Server Action
 * not found` (issue Sentry DELTA-FRONTEND-3). Un route handler tiene URL estable
 * → sobrevive a los deploys. RBAC (super_admin) lo aplica el backend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface BackendRecentDoctor {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const days = req.nextUrl.searchParams.get('days') ?? '7';

  const result = await backendGet<BackendRecentDoctor[]>(
    `/api/admin/doctors/recent?days=${encodeURIComponent(days)}`,
  );

  if (!result.ok) {
    // Best-effort: el bell no es crítico → lista vacía en vez de un error ruidoso.
    return NextResponse.json({ success: true, data: [] });
  }

  const data = (Array.isArray(result.value) ? result.value : []).map((d) => ({
    id: d.id,
    full_name: d.fullName,
    email: d.email,
    created_at: d.createdAt,
  }));

  return NextResponse.json({ success: true, data });
}
