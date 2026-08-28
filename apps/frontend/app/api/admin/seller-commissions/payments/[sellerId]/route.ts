/**
 * GET /api/admin/seller-commissions/payments/[sellerId]
 *
 * Thin-proxy al backend NestJS `GET /api/admin/seller-commissions/payments/:sellerId`.
 * RBAC (super_admin) lo aplica el backend.
 *
 * Retorna el historial de pagos registrados para un vendedor, ordenado por
 * paid_at DESC.
 *
 * Shape (camelCase — tal como serializa NestJS):
 *   [{ id, sellerId, amountUsd, method, reference, receiptUrl, notes,
 *      paidAt, createdBy, createdAt }]
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface SellerPaymentRow {
  id: string;
  sellerId: string;
  amountUsd: number;
  method: string;
  reference: string;
  receiptUrl: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
  createdAt: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sellerId: string }> },
): Promise<NextResponse> {
  const { sellerId } = await params;

  if (!sellerId) {
    return NextResponse.json({ success: false, error: 'sellerId requerido' }, { status: 400 });
  }

  const result = await backendGet<SellerPaymentRow[]>(
    `/api/admin/seller-commissions/payments/${sellerId}`,
  );

  if (!result.ok) {
    log.error('[admin/seller-commissions/payments/[sellerId] GET] backend error', {
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
