/**
 * POST /api/admin/sellers/[id]/welcome-email
 *
 * Reenvía el correo de bienvenida al programa de vendedores (SOLO super_admin).
 * Sirve para vendedores creados antes de que existiera el correo, o cuando el
 * envío al crearlo falló.
 *
 * Thin-proxy a POST /api/admin/sellers/:id/welcome-email del backend NestJS.
 * Respuesta del backend: { success: true, data: { sent: boolean } }
 * `sent: false` = el proveedor de correo falló; el vendedor no se modifica.
 *
 * Molde: app/api/admin/sellers/[id]/payment-details/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

interface WelcomeEmailResult {
  sent: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID de vendedor inválido' }, { status: 400 });
  }

  const result = await backendPost<WelcomeEmailResult>(
    `/api/admin/sellers/${id}/welcome-email`,
    {},
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
