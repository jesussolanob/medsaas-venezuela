/**
 * PUT    /api/admin/release-notes/[id]  — update
 * DELETE /api/admin/release-notes/[id]  — delete (drafts only; 409 if published)
 *
 * Thin-proxy → NestJS /api/admin/release-notes/:id
 * Roles: super_admin, admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/lib/auth-guards';
import { backendPut, backendDelete } from '@/lib/api-client.server';
import { UpdateReleaseNoteDtoSchema } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// PUT — update
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminOrSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params; // Next 16: params is a Promise
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = UpdateReleaseNoteDtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 422 },
    );
  }

  const result = await backendPut(`/api/admin/release-notes/${id}`, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

// ---------------------------------------------------------------------------
// DELETE — delete draft (409 if published)
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminOrSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params; // Next 16: params is a Promise
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const result = await backendDelete(`/api/admin/release-notes/${id}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
