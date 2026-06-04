/**
 * POST /api/admin/payments/approve
 * body: { payment_id: string }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing`. El use-case
 * approveSubscriptionPayment hace la transacción atómica: marca el pago aprobado,
 * extiende subscriptions.current_period_end, sincroniza el snapshot de profiles y
 * registra subscription_changes_log. RBAC (super_admin) lo enforce el backend.
 *
 * DEFERRED — Fase 5: email de confirmación al doctor (sendPaymentApprovedEmail).
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const { payment_id } = await req.json();
  if (!payment_id) {
    return NextResponse.json({ error: 'payment_id requerido' }, { status: 400 });
  }

  const result = await backendPut<{ newExpiresAt: string }>(
    `/api/admin/subscription-payments/${payment_id}/approve`,
    {},
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, new_expires_at: result.value.newExpiresAt });
}
