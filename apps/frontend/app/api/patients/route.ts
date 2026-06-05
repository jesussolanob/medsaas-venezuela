import 'server-only';

/**
 * app/api/patients/route.ts
 *
 * Thin-proxy → NestJS patients module.
 *
 * GET /api/patients?page=&limit=&search=  — lista paginada (PII enmascarada)
 * POST /api/patients                       — crear paciente (upsert por email/cedula)
 *
 * ETAPA 1: dev-auth headers via backendFetch.
 * ETAPA 2: reemplazar getDevUser() con Auth0 JWT de httpOnly cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const path = `/api/patients${qs ? `?${qs}` : ''}`;

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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Body JSON inválido' } },
      { status: 400 },
    );
  }

  const result = await backendFetch('/api/patients', { method: 'POST', body });
  if (!result.ok) {
    // 409 Conflict: el paciente ya existe — retornar el error del backend
    // que puede incluir existingId para que el caller lo use.
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
