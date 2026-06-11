import 'server-only';

/**
 * app/api/doctor/services/route.ts
 *
 * Thin-proxy → NestJS doctor-settings services endpoints.
 *
 * GET  /api/doctor/services  — lista de servicios (pricing plans) del médico
 * POST /api/doctor/services  — crear servicio
 *
 * Backend: GET/POST /api/doctor/services (NestJS @Controller('doctor'))
 *
 * ETAPA 1: dev-auth headers via backendFetch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';
import { requireRole } from '@/lib/auth-guards';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const officeId = searchParams.get('officeId');
  const path = officeId
    ? `/api/doctor/services?officeId=${encodeURIComponent(officeId)}`
    : '/api/doctor/services';

  const result = await backendFetch(path, { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Body JSON inválido' } },
      { status: 400 },
    );
  }

  const result = await backendFetch('/api/doctor/services', { method: 'POST', body });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
