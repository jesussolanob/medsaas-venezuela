import 'server-only';

/**
 * app/api/doctor/profile/route.ts
 *
 * Thin-proxy → NestJS doctor-settings profile endpoints.
 *
 * GET /api/doctor/profile  — perfil del médico autenticado (incluye paymentMethods)
 * PUT /api/doctor/profile  — actualizar perfil
 *
 * Backend: GET/PUT /api/doctor/profile (NestJS @Controller('doctor'))
 *
 * ETAPA 1: dev-auth headers via backendFetch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const result = await backendFetch('/api/doctor/profile', { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Body JSON inválido' } },
      { status: 400 },
    );
  }

  const result = await backendFetch('/api/doctor/profile', { method: 'PUT', body });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
