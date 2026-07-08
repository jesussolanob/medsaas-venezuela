import 'server-only';

/**
 * GET /api/doctor/shared-files/unread-counts
 *   → NestJS GET /api/doctor/shared-files/unread-counts
 *   Devuelve un mapa { [patientId]: number } con items no leídos por el doctor.
 *   Respuesta: { success: true, data: Record<string, number> }
 */

import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<Record<string, number>>('/api/doctor/shared-files/unread-counts');

  if (!result.ok) {
    log.error('[shared-files unread-counts GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
