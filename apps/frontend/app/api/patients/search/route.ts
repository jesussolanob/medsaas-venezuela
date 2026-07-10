import 'server-only';

/**
 * app/api/patients/search/route.ts
 *
 * Thin-proxy → NestJS patients search (GET /api/patients/search?q=&page=&limit=).
 *
 * Búsqueda híbrida: hash exacto (cédula/email) o substring del nombre in-app.
 * A diferencia de GET /api/patients (lista, que IGNORA `search`), este endpoint
 * SÍ filtra por el término. Devuelve `{ success, data: PatientListItem[] }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const path = `/api/patients/search${qs ? `?${qs}` : ''}`;

  const result = await backendFetch(path, { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
