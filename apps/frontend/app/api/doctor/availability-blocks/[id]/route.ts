import 'server-only';

/**
 * app/api/doctor/availability-blocks/[id]/route.ts
 *
 * Thin-proxy → NestJS availability-blocks module.
 *
 * DELETE /api/doctor/availability-blocks/:id → 204 No Content
 *
 * doctorId siempre se resuelve del usuario autenticado en el backend (anti-IDOR).
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendDelete } from '@/lib/api-client.server';
import { requireRole } from '@/lib/auth-guards';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const result = await backendDelete<void>(`/api/doctor/availability-blocks/${id}`);

  if (!result.ok) {
    log.error('[availability-blocks DELETE] backend error', {
      id,
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
