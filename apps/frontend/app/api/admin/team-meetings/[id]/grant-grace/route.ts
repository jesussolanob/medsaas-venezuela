/**
 * POST /api/admin/team-meetings/[id]/grant-grace
 *
 * Thin-proxy → NestJS POST /api/admin/team-meetings/:id/grant-grace
 *
 * Grants one grace month to the specialist whose meeting (by ID) is done.
 * The backend enforces:
 *   - Meeting must exist (404 if not found).
 *   - Meeting status must be 'done' (422 if not done).
 *   - At most one grace month per specialist (409 if already granted).
 *
 * Returns: { success: true, data: { doctorId: string, newExpiresAt: string } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GrantGraceResponse {
  doctorId: string;
  newExpiresAt: string;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID de reunión inválido.' }, { status: 400 });
  }

  const result = await backendPost<GrantGraceResponse>(
    `/api/admin/team-meetings/${id}/grant-grace`,
    {},
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
