/**
 * /api/admin/specialties — mantenedor de especialidades médicas (super_admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `specialties`. RBAC (super_admin) lo enforce
 * el backend. El frontend no toca la BD directamente.
 *  - GET  → `GET /api/admin/specialties`  — lista todas las especialidades (activas e inactivas).
 *  - POST → `POST /api/admin/specialties` — crea una nueva especialidad.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';

export interface SpecialtyAdminDto {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function fail(error: { message: string; status: number }) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<SpecialtyAdminDto[]>('/api/admin/specialties');
  if (!result.ok) return fail(result.error);

  const rows = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  }

  const payload: Record<string, unknown> = { name: obj.name.trim() };
  if (typeof obj.sort_order === 'number') {
    payload.sort_order = obj.sort_order;
  }

  const result = await backendPost<SpecialtyAdminDto>('/api/admin/specialties', payload);
  if (!result.ok) return fail(result.error);

  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
