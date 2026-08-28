/**
 * POST /api/admin/seller-commissions/assign
 *
 * Asigna o reasigna un especialista a un vendedor (solo super_admin).
 * Thin-proxy al backend NestJS `POST /api/admin/seller-commissions/assign`.
 *
 * Body : { specialist_id: string (UUID), seller_id: string (UUID) }
 * Response : { success: true, data: { assigned: true } }
 *
 * Reglas del backend (ADR-046 / ADR-047):
 *   - Sobreescribe sold_by y escribe sold_by_source = 'admin'.
 *   - No genera comisión de entrada — la asignación via admin no paga signup.
 *   - Solo genera comisión cuando el especialista cambia a un plan pago DESPUÉS.
 *   - Inserta un seller_attribution_log (de quién → a quién, quién lo asignó, cuándo).
 *   - Si el vendedor está deshabilitado: 422 SELLER_NOT_FOUND.
 *   - Si el especialista no existe: 422 SPECIALIST_NOT_FOUND.
 *
 * Molde: app/api/admin/doctors/[id]/access/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

interface AssignBody {
  specialist_id: string;
  seller_id: string;
}

interface AssignResponseData {
  assigned: true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: AssignBody;
  try {
    body = (await req.json()) as AssignBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  if (!body.specialist_id || !UUID_RE.test(body.specialist_id)) {
    return NextResponse.json(
      { error: 'specialist_id es requerido y debe ser un UUID válido' },
      { status: 400 },
    );
  }

  if (!body.seller_id || !UUID_RE.test(body.seller_id)) {
    return NextResponse.json(
      { error: 'seller_id es requerido y debe ser un UUID válido' },
      { status: 400 },
    );
  }

  const result = await backendPost<AssignResponseData>('/api/admin/seller-commissions/assign', {
    specialist_id: body.specialist_id,
    seller_id: body.seller_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
