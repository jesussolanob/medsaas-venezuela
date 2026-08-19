/**
 * POST /api/admin/subscriptions/extend
 * Extiende la suscripción de un doctor (manual grant), en DÍAS o en MESES.
 * body: { doctor_id: string; months?: number; days?: number; reason?: string }
 * Exactamente uno de `months` / `days`.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (subscriptions-ops). El backend
 * aplica la transacción (subscriptions + profiles snapshot + subscription_changes_log).
 * RBAC (super_admin) lo enforce el backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const { doctor_id, months, days, reason } = await req.json();

  // La extensión va en DÍAS o en MESES, exactamente una de las dos. Antes solo
  // se aceptaban meses, así que regalar diez días de prueba —el caso comercial
  // más común— no se podía expresar.
  const enMeses = months != null;
  const enDias = days != null;

  if (!doctor_id || enMeses === enDias) {
    return NextResponse.json(
      { error: 'Indicá el especialista y la extensión en días o en meses, pero no en ambos' },
      { status: 400 },
    );
  }

  const cantidad = Number(enMeses ? months : days);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return NextResponse.json(
      { error: 'La cantidad debe ser un número entero mayor que cero' },
      { status: 400 },
    );
  }

  const result = await backendPost<{ newExpiresAt: string }>('/api/admin/subscriptions/extend', {
    doctor_id,
    ...(enMeses ? { months: cantidad } : { days: cantidad }),
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
