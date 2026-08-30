/**
 * GET /api/admin/seller-commissions/pending
 *
 * Thin-proxy al backend NestJS `GET /api/admin/seller-commissions/pending`.
 * RBAC (super_admin) lo aplica el backend con @Roles('super_admin').
 *
 * Respuesta: lista de vendedores con comisiones pendientes + tasa BCV actual.
 *
 * ⚠️ BREAKING CHANGE (2026-08-28): el backend dejó de retornar un array pelado.
 * Ahora responde { bcvRate: number | null, sellers: [...] }.
 * El cliente debe leer data.sellers (no data directamente).
 *
 * Shape (camelCase — tal como serializa NestJS):
 *   {
 *     bcvRate: number | null,   // tasa BCV actual; null → no disponible
 *     sellers: [{
 *       sellerId, sellerName, totalPendingUsd, pendingCount,
 *       commissions: [{ commissionId, specialistId, specialistName,
 *                       type, amountUsd, planKey, earnedAt }]
 *     }]
 *   }
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

/** Shape del data que retorna el backend para este endpoint (post breaking change). */
interface BackendPendingData {
  /** Tasa BCV actual (Bs por USD). null → no disponible; mostrar solo USD. */
  bcvRate: number | null;
  sellers: PendingBySeller[];
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<BackendPendingData>('/api/admin/seller-commissions/pending');

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
    data: {
      bcvRate: result.value?.bcvRate ?? null,
      sellers: Array.isArray(result.value?.sellers) ? result.value.sellers : [],
    },
  });
}
