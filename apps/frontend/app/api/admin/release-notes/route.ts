/**
 * GET  /api/admin/release-notes  — list (status, limit, offset)
 * POST /api/admin/release-notes  — create draft
 *
 * Thin-proxy → NestJS /api/admin/release-notes
 * Roles: super_admin, admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/lib/auth-guards';
import { backendGetPaged, backendPost } from '@/lib/api-client.server';
import { CreateReleaseNoteDtoSchema } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminReleaseNote {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audiencePlans: string[] | null;
  publishedAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const guard = await requireAdminOrSuperAdmin();
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const params = new URLSearchParams();
  if (sp.get('status')) params.set('status', sp.get('status')!);
  if (sp.get('limit')) params.set('limit', sp.get('limit')!);
  if (sp.get('offset')) params.set('offset', sp.get('offset')!);

  const qs = params.toString();
  const result = await backendGetPaged<AdminReleaseNote>(
    `/api/admin/release-notes${qs ? `?${qs}` : ''}`,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({
    success: true,
    data: result.value.items,
    meta: { total: result.value.total },
  });
}

// ---------------------------------------------------------------------------
// POST — create draft
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const guard = await requireAdminOrSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = CreateReleaseNoteDtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 422 },
    );
  }

  const result = await backendPost<AdminReleaseNote>('/api/admin/release-notes', parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
