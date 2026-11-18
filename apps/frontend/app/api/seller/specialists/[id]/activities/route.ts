/**
 * /api/seller/specialists/:id/activities — thin-proxy to the backend sellers module.
 *
 * GET  → current follow-up status + activity history (newest first).
 * POST → change the status and/or add a comment. The backend stamps date, time and
 *        author, scopes it to the seller's own specialists (anti-IDOR) and validates.
 * Comments may describe a conversation with the specialist: never log the body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badId(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'ID de especialista inválido' },
    { status: 400 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return badId();

  const result = await backendGet<unknown>(`/api/seller/specialists/${id}/activities`);
  if (!result.ok) {
    log.error('[seller/specialists/:id/activities GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status ?? 502 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return badId();

  let body: { status?: unknown; comment?: unknown };
  try {
    body = (await req.json()) as { status?: unknown; comment?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400 });
  }
  const payload: { status?: string; comment?: string } = {};
  if (typeof body.status === 'string' && body.status) payload.status = body.status;
  if (typeof body.comment === 'string' && body.comment.trim())
    payload.comment = body.comment.trim();

  const result = await backendPost<unknown>(`/api/seller/specialists/${id}/activities`, payload);
  if (!result.ok) {
    log.error('[seller/specialists/:id/activities POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status ?? 502 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
