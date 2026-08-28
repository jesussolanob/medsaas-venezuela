/**
 * GET /api/admin/specialist-assignment/[specialistId]
 *
 * Thin-proxy → NestJS `GET /api/admin/specialist-assignment/:specialistId`.
 *
 * POR QUÉ EXISTE
 * --------------
 * Antes de reasignar un especialista, el admin tiene que ver **de quién a quién**
 * lo está moviendo: pisar una atribución le saca comisiones futuras a alguien.
 *
 * Hasta que existió este endpoint, la pantalla **adivinaba** el vendedor actual
 * buscando comisiones pendientes — y si al especialista ya se le habían pagado
 * todas, o nunca había generado ninguna, el modal de reconfirmación no aparecía
 * y la atribución se pisaba en silencio.
 *
 * Respuesta: { sellerId, sellerName, soldBySource } — los tres en null cuando el
 * especialista no tiene vendedor (o no existe: no se distinguen a propósito).
 * `soldBySource` es 'code' | 'seller_manual' | 'admin' | null.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export interface SpecialistAssignment {
  sellerId: string | null;
  sellerName: string | null;
  soldBySource: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ specialistId: string }> },
): Promise<NextResponse> {
  const guard = await requireRole(['super_admin']);
  if (!guard.ok) return guard.response;

  const { specialistId } = await params;
  if (!specialistId) {
    return NextResponse.json({ error: 'Falta el id del especialista' }, { status: 400 });
  }

  const result = await backendGet<SpecialistAssignment>(
    `/api/admin/specialist-assignment/${encodeURIComponent(specialistId)}`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
