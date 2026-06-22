/**
 * /api/admin/specialties/[id] — actualización parcial de una especialidad.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `specialties`.
 *  - PUT → `PUT /api/admin/specialties/:id` — actualiza nombre, is_active y/o sort_order.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import type { SpecialtyAdminDto } from '../route';

function fail(error: { message: string; status: number }) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  if (typeof obj.name === 'string' && obj.name.trim()) update.name = obj.name.trim();
  if (typeof obj.is_active === 'boolean') update.is_active = obj.is_active;
  if (typeof obj.sort_order === 'number') update.sort_order = obj.sort_order;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Ningún campo editable provisto' }, { status: 400 });
  }

  const result = await backendPut<SpecialtyAdminDto>(
    `/api/admin/specialties/${encodeURIComponent(id)}`,
    update,
  );
  if (!result.ok) return fail(result.error);

  return NextResponse.json({ success: true, data: result.value });
}
