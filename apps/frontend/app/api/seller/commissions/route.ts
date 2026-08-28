/**
 * /api/seller/commissions — thin-proxy al módulo `seller-commissions` del backend.
 *
 * GET → todas las comisiones del vendedor autenticado, pagadas y pendientes.
 *
 * El `sellerId` lo saca el backend de la sesión — nunca se manda desde acá.
 * El vendedor no puede ver las comisiones de otro vendedor (anti-IDOR en el backend).
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
  status: 'pending' | 'paid';
  /** ISO 8601. Cuándo se generó la comisión. */
  earnedAt: string;
  /** UUID del pago que la liquidó. null si todavía está pendiente. */
  paymentId: string | null;
  createdAt: string;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<SellerCommissionDto[]>('/api/seller/commissions');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value ?? [] });
}
