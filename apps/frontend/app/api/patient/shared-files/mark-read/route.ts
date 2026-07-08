import 'server-only';

/**
 * POST /api/patient/shared-files/mark-read
 *   → NestJS POST /api/patient/shared-files/mark-read
 *   Marca todos los items del paciente logueado como leídos por el paciente.
 *   El backend resuelve el scope desde auth_user_id (sin body requerido).
 *   Respuesta: { success: true, data: null }
 */

import { NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const result = await backendPost<null>('/api/patient/shared-files/mark-read', {});

  if (!result.ok) {
    log.error('[patient/shared-files mark-read POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: null });
}
