/**
 * /api/seller/commissions — thin-proxy al módulo `seller-commissions` del backend.
 *
 * GET → todas las comisiones del vendedor autenticado, pagadas y pendientes,
 * junto con la tasa BCV actual para conversión a bolívares en el cliente.
 *
 * El `sellerId` lo saca el backend de la sesión — nunca se manda desde acá.
 * El vendedor no puede ver las comisiones de otro vendedor (anti-IDOR en el backend).
 *
 * ⚠️ BREAKING CHANGE (2026-08-28): el backend dejó de retornar un array pelado.
 * Ahora responde { bcvRate: number | null, commissions: [...] }.
 * El cliente debe leer data.commissions (no data directamente).
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

/** Shape de cada comisión tal como la serializa el controller (camelCase). */
export interface SellerCommissionDto {
  id: string;
  sellerId: string;
  specialistId: string;
  /** Nombre del especialista. PII — solo expuesta al vendedor que la generó. */
  specialistName: string;
  /** 'signup' = por completar el alta; 'plan' = por pasar a un plan pago. */
  type: 'signup' | 'plan';
  amountUsd: number;
  /** Plan del que vino la comisión. Solo presente en type = 'plan'. */
  planKey: string | null;
  status: 'pending' | 'approved' | 'paid';
  /** ISO 8601. Cuándo se generó la comisión. */
  earnedAt: string;
  /** UUID del pago que la liquidó. null si todavía está pendiente. */
  paymentId: string | null;
  createdAt: string;
}

/** Shape del data que retorna el backend para este endpoint (post breaking change). */
interface BackendCommissionsData {
  /** Tasa BCV actual (Bs por USD). null → no disponible; mostrar solo USD. */
  bcvRate: number | null;
  commissions: SellerCommissionDto[];
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<BackendCommissionsData>('/api/seller/commissions');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      bcvRate: result.value?.bcvRate ?? null,
      commissions: Array.isArray(result.value?.commissions) ? result.value.commissions : [],
    },
  });
}
