/**
 * POST /api/seller/deactivate — el vendedor da de baja su propia cuenta.
 *
 * Thin-proxy → NestJS `POST /api/seller/deactivate`.
 *
 * Es una DESACTIVACIÓN, no un borrado: sus especialistas atribuidos, sus
 * comisiones y sus pagos quedan bajo el mismo id, auditables, y un super_admin
 * puede reactivarlo desde `/admin/sellers`.
 *
 * SEGURIDAD: el `sellerId` lo saca el backend de `CurrentUser().sub`. Acá NO se
 * manda ningún id — uno solo puede darse de baja a sí mismo.
 *
 * Respuesta: { deactivated: true, pendingCommissionsUsd, pendingCommissionsCount }
 * El pendiente es informativo: la baja nunca se bloquea por tener plata por cobrar,
 * porque Delta se la sigue debiendo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface DeactivateResult {
  deactivated: true;
  pendingCommissionsUsd: number;
  pendingCommissionsCount: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => ({}));
  const reason =
    typeof body === 'object' && body && 'reason' in body
      ? (body as { reason: unknown }).reason
      : null;

  const result = await backendPost<DeactivateResult>('/api/seller/deactivate', {
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
