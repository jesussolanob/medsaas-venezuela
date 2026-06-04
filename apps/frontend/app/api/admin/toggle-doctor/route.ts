/**
 * /api/admin/toggle-doctor — suspende o reactiva la suscripción de un médico.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (subscriptions suspend/reactivate).
 * RBAC (super_admin) lo enforce el backend. Reemplaza el UPDATE directo a Supabase.
 *
 * Request (sin cambios para los consumidores): { doctorId, action: 'suspend' | 'activate' }
 * Response: { success, doctorId, action, is_active }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  const doctorId =
    typeof body === 'object' && body && 'doctorId' in body
      ? String((body as { doctorId: unknown }).doctorId)
      : '';
  const action =
    typeof body === 'object' && body && 'action' in body
      ? String((body as { action: unknown }).action)
      : '';

  if (!doctorId || !action) {
    return NextResponse.json({ error: 'Missing doctorId or action' }, { status: 400 });
  }
  if (!['suspend', 'activate'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be suspend or activate' },
      { status: 400 },
    );
  }

  const path =
    action === 'suspend'
      ? '/api/admin/subscriptions/suspend'
      : '/api/admin/subscriptions/reactivate';
  const result = await backendPost<unknown>(path, { doctor_id: doctorId });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({
    success: true,
    doctorId,
    action,
    is_active: action === 'activate',
  });
}
