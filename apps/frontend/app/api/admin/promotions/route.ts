/**
 * /api/admin/promotions — gestión de promociones de planes (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `promotions`. RBAC (super_admin) lo enforce
 * el backend. La validación promo<original es invariante de dominio (400).
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost, backendPut, backendDelete } from '@/lib/api-client.server';

function fail(error: { message: string; status: number }) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

// GET — list all promotions
export async function GET() {
  const result = await backendGet<unknown[]>('/api/admin/promotions');
  if (!result.ok) return fail(result.error);
  return NextResponse.json(Array.isArray(result.value) ? result.value : []);
}

// POST — create a promotion
export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await backendPost<unknown>('/api/admin/promotions', body);
  if (!result.ok) return fail(result.error);
  return NextResponse.json(result.value);
}

// PUT — update a promotion (legacy body shape: { id, ...updates })
export async function PUT(req: NextRequest) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const result = await backendPut<unknown>(`/api/admin/promotions/${id}`, updates);
  if (!result.ok) return fail(result.error);
  return NextResponse.json(result.value);
}

// DELETE — delete a promotion (?id=)
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  const result = await backendDelete<unknown>(`/api/admin/promotions/${id}`);
  if (!result.ok) return fail(result.error);
  return NextResponse.json({ success: true });
}
