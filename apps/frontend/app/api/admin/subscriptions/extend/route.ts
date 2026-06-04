/**
 * POST /api/admin/subscriptions/extend
 * Extiende la suscripción de un doctor por N meses (manual grant).
 * body: { doctor_id: string; months: number; reason?: string }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (subscriptions-ops). El backend
 * aplica la transacción (subscriptions + profiles snapshot + subscription_changes_log).
 * RBAC (super_admin) lo enforce el backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const { doctor_id, months, reason } = await req.json();
  if (!doctor_id || !months || months < 1) {
    return NextResponse.json({ error: 'doctor_id + months>=1 requerido' }, { status: 400 });
  }

  const result = await backendPost<{ newExpiresAt: string }>('/api/admin/subscriptions/extend', {
    doctor_id,
    months: Number(months),
    reason: reason ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, new_expires_at: result.value.newExpiresAt });
}
