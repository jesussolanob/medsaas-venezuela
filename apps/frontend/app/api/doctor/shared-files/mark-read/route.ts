import 'server-only';

/**
 * POST /api/doctor/shared-files/mark-read
 *   → NestJS POST /api/doctor/shared-files/mark-read
 *   Marca todos los items de un paciente como leídos por el doctor.
 *   Body: { patientId }
 *   Respuesta: { success: true, data: null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { patientId?: string };
  try {
    body = (await req.json()) as { patientId?: string };
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : '';
  if (!patientId) {
    return NextResponse.json({ error: 'El ID del paciente es requerido' }, { status: 400 });
  }

  const result = await backendPost<null>('/api/doctor/shared-files/mark-read', { patientId });

  if (!result.ok) {
    log.error('[shared-files mark-read POST] backend error', {
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
