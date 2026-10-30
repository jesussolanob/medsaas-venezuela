/**
 * POST /api/admin/release-notes/[id]/unpublish
 *
 * Thin-proxy → NestJS POST /api/admin/release-notes/:id/unpublish
 * Roles: super_admin, admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdminOrSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const result = await backendPost(`/api/admin/release-notes/${id}/unpublish`, {});
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
