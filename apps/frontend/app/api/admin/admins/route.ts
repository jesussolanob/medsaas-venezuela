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

// POST /api/admin/admins — crea un nuevo super_admin.
// ETAPA 1: DESHABILITADO. La creación de usuarios con contraseña requiere un
// proveedor de identidad (Auth0 — Fase 4). Sin Supabase.
export async function POST() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  return NextResponse.json(
    {
      error: 'La creación de administradores estará disponible en una próxima versión (Auth0).',
      code: 'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
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
