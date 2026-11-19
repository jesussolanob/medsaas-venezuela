import 'server-only';

/**
 * app/api/doctor/document-files/[id]/url/route.ts
 *
 * GET /api/doctor/document-files/:id/url
 *   → NestJS GET /api/doctor/document-files/:id/url
 *   Returns a short-lived signed URL for the doctor to preview the file.
 *   TTL: 5 minutes (300 s) — controlled by the backend.
 *   Returns: { success: true, data: { url: string } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const result = await backendGet<{ url: string }>(`/api/doctor/document-files/${id}/url`);

  if (!result.ok) {
    log.error('[document-files url GET] backend error', {
      id,
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
