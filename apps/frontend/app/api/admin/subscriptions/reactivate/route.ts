/**
 * POST /api/admin/subscriptions/reactivate
 * body: { doctor_id: string }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (subscriptions-ops). Si la
 * suscripción estaba vencida, el backend concede un mes nuevo.
 * RBAC (super_admin) lo enforce el backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const { doctor_id } = await req.json();
  if (!doctor_id) return NextResponse.json({ error: 'doctor_id requerido' }, { status: 400 });

  const result = await backendPost<{ newExpiresAt: string | null }>(
    '/api/admin/subscriptions/reactivate',
    { doctor_id },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, new_expires_at: result.value.newExpiresAt });
}
