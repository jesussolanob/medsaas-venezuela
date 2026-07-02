/**
 * app/api/doctor/appointments/route.ts
 *
 * DELETE — proxies to the backend `DELETE /api/appointments/:id`, which deletes
 * the appointment and cascades to its linked consultation. Ownership is enforced
 * server-side (anti-IDOR); the backend returns 403/404 for a non-owned id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendDelete } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'Falta el parámetro id', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendDelete<unknown>(`/api/appointments/${id}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true });
}
