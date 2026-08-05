/**
 * POST /api/admin/payments/reject
 * body: { payment_id: string; reason: string }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing` (subscription-payments).
 * RBAC (super_admin) lo enforce el backend.
 *
 * DEFERRED — Fase 5: email de rechazo al doctor (sendPaymentRejectedEmail).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPut } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const guard = await requireRole(['super_admin']);
  if (!guard.ok) return guard.response;

  const { payment_id, reason } = await req.json();
  if (!payment_id || !reason) {
    return NextResponse.json({ error: 'payment_id + reason requeridos' }, { status: 400 });
  }

  const result = await backendPut<{ rejected: true }>(
    `/api/admin/subscription-payments/${payment_id}/reject`,
    { reason },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true });
}
