/**
 * PUT /api/admin/doctors/[id]/access
 *
 * Bloquea o desbloquea el acceso de un médico (ban duro de cuenta).
 * ETAPA 1 — thin-proxy al backend NestJS `PUT /api/admin/doctors/:id/access`.
 * RBAC (super_admin) lo enforce el backend.
 *
 * Request body : { is_active: boolean; reason?: string }
 * Response     : { success: true, data: { id, isActive } }
 *
 * Errores posibles del backend:
 *   - 404 DOCTOR_NOT_FOUND
 *   - 422 CANNOT_BLOCK_SUPER_ADMIN
 *   - 422 CANNOT_BLOCK_SELF
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPut } from '@/lib/api-client.server';

interface AccessRequestBody {
  is_active: boolean;
  reason?: string;
}

interface AccessResponseData {
  id: string;
  isActive: boolean;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'id de médico requerido' }, { status: 400 });
  }

  let body: AccessRequestBody;
  try {
    body = (await req.json()) as AccessRequestBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json(
      { error: 'El campo is_active es requerido y debe ser un booleano' },
      { status: 400 },
    );
  }

  const result = await backendPut<AccessResponseData>(`/api/admin/doctors/${id}/access`, {
    is_active: body.is_active,
    ...(body.reason !== undefined ? { reason: body.reason } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
