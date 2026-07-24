import 'server-only';

/**
 * app/api/doctor/pending-consultations/[id]/schedule/route.ts
 *
 * POST — thin-proxy to POST /api/doctor/pending-consultations/:id/schedule
 *        Body: { scheduled_at: ISO8601, office_id?: UUID | null, appointment_mode?: 'presencial' | 'online' | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 });
  }

  const result = await backendPost<unknown>(
    `/api/doctor/pending-consultations/${id}/schedule`,
    body,
  );

  if (!result.ok) {
    log.error('[pending-consultations/:id/schedule POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
