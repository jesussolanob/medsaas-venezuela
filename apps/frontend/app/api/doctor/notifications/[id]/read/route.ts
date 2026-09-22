/**
 * /api/doctor/notifications/[id]/read — POST marca una notificación como leída.
 *
 * ADR-022: route handler (no Server Action).
 * Anti-IDOR: el backend valida que la notificación pertenece al doctor autenticado.
 *
 * Proxies to: POST /api/doctor/notifications/:id/read (backend)
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

interface ReadResult {
  id: string;
  readAt: string;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { error: 'ID de notificación inválido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendPost<ReadResult>(`/doctor/notifications/${id}/read`, {});

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
