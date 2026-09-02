/**
 * POST /api/admin/seller-commissions/approve
 *
 * Thin-proxy al backend NestJS `POST /api/admin/seller-commissions/approve`.
 * RBAC (super_admin) lo aplica el backend.
 *
 * Habilita comisiones pendientes para su pago. NO registra ningún pago ni mueve
 * plata: solo destraba el paso siguiente. El backend rechaza cualquier comisión
 * que no esté en 'pending' o que sea de otro vendedor.
 *
 * Body esperado:
 *   { seller_id, commission_ids[] }
 *
 * Respuesta:
 *   { success: true, data: { approved: number } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ApproveRequestBody {
  seller_id: string;
  commission_ids: string[];
}

export interface ApproveCommissionsResult {
  approved: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ApproveRequestBody;
  try {
    body = (await req.json()) as ApproveRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo de la solicitud inválido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  if (!body.seller_id?.trim()) {
    return NextResponse.json(
      { error: 'seller_id es requerido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.commission_ids) || body.commission_ids.length === 0) {
    return NextResponse.json(
      { error: 'Seleccioná al menos una comisión para aprobar.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendPost<ApproveCommissionsResult>(
    '/api/admin/seller-commissions/approve',
    { seller_id: body.seller_id, commission_ids: body.commission_ids },
  );

  if (!result.ok) {
    log.error('[admin/seller-commissions/approve POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
