/**
 * GET /api/admin/seller-commissions/pending
 *
 * Thin-proxy al backend NestJS `GET /api/admin/seller-commissions/pending`.
 * RBAC (super_admin) lo aplica el backend con @Roles('super_admin').
 *
 * Respuesta: lista de vendedores con comisiones pendientes, ordenada por el
 * backend (totalPendingUsd desc). Cada vendedor incluye el detalle de cada
 * comisión: qué especialista, si es de entrada o de plan, monto y fecha.
 *
 * Shape (camelCase — tal como serializa NestJS):
 *   [{
 *     sellerId, sellerName, totalPendingUsd, pendingCount,
 *     commissions: [{ commissionId, specialistId, specialistName,
 *                     type, amountUsd, planKey, earnedAt }]
 *   }]
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface PendingCommissionItem {
  commissionId: string;
  specialistId: string;
  specialistName: string;
  type: 'signup' | 'plan';
  amountUsd: number;
  planKey: string | null;
  earnedAt: string;
}

export interface PendingBySeller {
  sellerId: string;
  sellerName: string;
  totalPendingUsd: number;
  pendingCount: number;
  commissions: PendingCommissionItem[];
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<PendingBySeller[]>('/api/admin/seller-commissions/pending');

  if (!result.ok) {
    log.error('[admin/seller-commissions/pending GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: Array.isArray(result.value) ? result.value : [],
  });
}
