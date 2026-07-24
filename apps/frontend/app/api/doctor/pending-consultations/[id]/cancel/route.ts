import 'server-only';

/**
 * app/api/doctor/pending-consultations/[id]/cancel/route.ts
 *
 * PUT — thin-proxy to PUT /api/doctor/pending-consultations/:id/cancel
 *       No body required. Only pending_scheduling status can be cancelled (backend enforces).
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendPut<unknown>(`/api/doctor/pending-consultations/${id}/cancel`, {});

  if (!result.ok) {
    log.error('[pending-consultations/:id/cancel PUT] backend error', {
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
