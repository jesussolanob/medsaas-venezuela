/**
 * POST /api/admin/subscriptions/suspend
 * body: { doctor_id: string; reason?: string }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (subscriptions-ops).
 * RBAC (super_admin) lo enforce el backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const { doctor_id, reason } = await req.json();
  if (!doctor_id) return NextResponse.json({ error: 'doctor_id requerido' }, { status: 400 });

  const result = await backendPost<{ suspended: true }>('/api/admin/subscriptions/suspend', {
    doctor_id,
    reason: reason ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true });
}
