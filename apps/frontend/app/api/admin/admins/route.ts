import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet, backendPut } from '@/lib/api-client.server';

// GET /api/admin/admins — lista super_admins (proxied to NestJS GET /api/admin/admins)
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<{ id: string; fullName: string; email: string; role: string; createdAt: string }[]>(
    '/api/admin/admins',
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status || 500 });
  }

  // Normalize camelCase backend response to snake_case for frontend consumers
  const data = result.value.map((a) => ({
    id: a.id,
    email: a.email,
    full_name: a.fullName,
    role: a.role,
    created_at: a.createdAt,
  }));

  return NextResponse.json({ data });
}

// POST /api/admin/admins — crea un nuevo super_admin
// FASE 5/6: pendiente backend — requires Supabase Auth admin.createUser locally
// until the backend implements user provisioning with an identity provider.
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  // FASE 5/6: pendiente backend — Supabase admin used for user creation only
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const body = await req.json();
  const { email, password, full_name, phone } = body;

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: 'email, password y full_name son requeridos' },
      { status: 400 },
    );
  }
  if ((password as string).length < 8) {
    return NextResponse.json(
      { error: 'El password debe tener al menos 8 caracteres' },
      { status: 400 },
    );
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'super_admin' },
  });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  const userId = authData.user.id;

  const { error: pErr } = await admin.from('profiles').upsert(
    { id: userId, email, full_name, phone: phone || null, role: 'super_admin' },
    { onConflict: 'id' },
  );

  if (pErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: userId, email, full_name });
}

// DELETE /api/admin/admins?id=<uuid> — revoca un super_admin (degrada a doctor)
// Proxied to NestJS PUT /api/admin/admins/:id/role with role='doctor'
export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get('id');
  if (!targetId) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }
  if (targetId === guard.user.id) {
    return NextResponse.json(
      { error: 'No puedes revocar tu propio acceso de super_admin' },
      { status: 400 },
    );
  }

  const result = await backendPut<{ updated: true }>(
    `/api/admin/admins/${targetId}/role`,
    { role: 'doctor' },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status || 500 });
  }

  return NextResponse.json({ success: true });
}
