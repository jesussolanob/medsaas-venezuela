import 'server-only';

/**
 * app/api/doctor/offices/route.ts
 *
 * Thin-proxy → NestJS doctor/offices module.
 *
 * GET /api/doctor/offices  — lista de consultorios del médico autenticado
 *
 * Backend: GET /api/doctor/offices (NestJS @Controller('doctor/offices'))
 *
 * ETAPA 1: dev-auth headers via backendFetch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const result = await backendFetch('/api/doctor/offices', { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
