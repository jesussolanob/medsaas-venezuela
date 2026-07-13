/**
 * PUT /api/admin/doctors/[id]/subscription
 *
 * Cambia el plan y/o estado de la suscripción de un médico.
 * ETAPA 1 — thin-proxy al backend NestJS `PUT /api/admin/doctors/:id/subscription`.
 * RBAC (super_admin) lo enforce el backend.
 *
 * Request body : { plan: string; status: string; expires_at: string; notes?: string }
 * Response     : { success: true }
 *
 * Valores de plan: free_trial | delta_free | delta_base | delta_plus
 * Valores de status: active | trial | past_due | suspended
 *
 * Errores posibles del backend:
 *   - 400 INVALID_PLAN / INVALID_STATUS
 *   - 404 DOCTOR_NOT_FOUND
 *   - 422 VALIDATION_ERROR
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPut } from '@/lib/api-client.server';

interface SubscriptionRequestBody {
  plan: string;
  status: string;
  expires_at: string;
  notes?: string;
}

const VALID_PLANS = ['free_trial', 'delta_free', 'delta_base', 'delta_plus'] as const;
const VALID_STATUSES = ['active', 'trial', 'past_due', 'suspended'] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'id de médico requerido' }, { status: 400 });
  }

  let body: SubscriptionRequestBody;
  try {
    body = (await req.json()) as SubscriptionRequestBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  const { plan, status, expires_at, notes } = body;

  if (!plan || !(VALID_PLANS as readonly string[]).includes(plan)) {
    return NextResponse.json(
      { error: `Plan inválido. Valores permitidos: ${VALID_PLANS.join(', ')}` },
      { status: 400 },
    );
  }

  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `Estado inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  if (!expires_at || isNaN(Date.parse(expires_at))) {
    return NextResponse.json(
      { error: 'expires_at debe ser una fecha ISO 8601 válida' },
      { status: 400 },
    );
  }

  const result = await backendPut<unknown>(`/api/admin/doctors/${id}/subscription`, {
    plan,
    status,
    expires_at,
    ...(notes !== undefined ? { notes } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true });
}
